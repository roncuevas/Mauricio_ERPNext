#!/usr/bin/env python3
"""Seed a small, deterministic ERPNext dataset through the public REST API."""

from __future__ import annotations

import json
import os
import secrets
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from http.cookiejar import CookieJar
from pathlib import Path


BASE_URL = os.getenv("ERP_URL", "http://localhost:8080").rstrip("/")
ADMIN_PASSWORD = os.getenv("ERP_ADMIN_PASSWORD", "admin")
SITE = os.getenv("ERP_SITE", "frontend")
ENV_FILE = Path(".env.erpnext.local")


class Api:
    def __init__(self) -> None:
        self.cookies = CookieJar()
        self.opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.cookies))

    def request(self, method: str, path: str, payload: dict | None = None) -> dict:
        body = None
        headers = {"Accept": "application/json", "Content-Type": "application/json"}
        if payload is not None:
            body = json.dumps(payload).encode()
        request = urllib.request.Request(BASE_URL + path, data=body, headers=headers, method=method)
        try:
            with self.opener.open(request, timeout=30) as response:
                raw = response.read().decode()
        except urllib.error.HTTPError as error:
            raw = error.read().decode()
            try:
                detail = json.loads(raw)
            except json.JSONDecodeError:
                detail = raw
            if error.code != 404:
                raise RuntimeError(f"{method} {path} ({error.code}): {detail}") from error
            return {"_missing": True}
        return json.loads(raw) if raw else {}

    def login(self) -> None:
        payload = urllib.parse.urlencode({"usr": "Administrator", "pwd": ADMIN_PASSWORD}).encode()
        request = urllib.request.Request(BASE_URL + "/api/method/login", data=payload, method="POST")
        with self.opener.open(request, timeout=30) as response:
            if response.status >= 400:
                raise RuntimeError(f"No se pudo iniciar sesión HTTP {response.status}")

    def get(self, doctype: str, name: str) -> dict | None:
        result = self.request("GET", f"/api/resource/{quote(doctype)}/{quote(name)}")
        return None if result.get("_missing") else result.get("data", result.get("message"))

    def ensure(self, doctype: str, document: dict) -> dict:
        name = document.get("name")
        if name:
            existing = self.get(doctype, name)
            if existing:
                return existing
        result = self.request("POST", f"/api/resource/{quote(doctype)}", document)
        return result.get("data", result.get("message", result))

    def find_one(self, doctype: str, filters: list[list[object]]) -> dict | None:
        params = urllib.parse.urlencode({"filters": json.dumps(filters), "limit_page_length": "1"})
        result = self.request("GET", f"/api/resource/{quote(doctype)}?{params}")
        rows = result.get("data", [])
        return rows[0] if rows else None


def quote(value: str) -> str:
    return urllib.parse.quote(value, safe="")


def wait_for_api() -> None:
    deadline = time.time() + 180
    while time.time() < deadline:
        try:
            urllib.request.urlopen(BASE_URL + "/api/method/ping", timeout=5).close()
            return
        except Exception:
            time.sleep(3)
    raise RuntimeError(f"ERPNext no respondió en {BASE_URL}")


def generate_api_credentials(api: Api) -> tuple[str, str]:
    result = api.request(
        "POST",
        "/api/method/frappe.core.doctype.user.user.generate_keys",
        {"user": "Administrator"},
    )
    message = result.get("message", result)
    user = api.get("User", "Administrator") or {}
    api_key = user.get("api_key") or message.get("api_key")
    api_secret = message.get("api_secret") if isinstance(message, dict) else None
    if not api_key or not api_secret:
        raise RuntimeError(f"ERPNext no devolvió credenciales API: {result}")
    return str(api_key), str(api_secret)


def seed(api: Api) -> None:
    api.ensure("Warehouse Type", {"name": "Transit"})
    api.ensure("Warehouse Type", {"name": "Stores"})
    api.ensure("Customer Group", {"name": "Individual", "customer_group_name": "Individual"})
    api.ensure("Territory", {"name": "All Territories", "territory_name": "All Territories"})
    api.ensure("Supplier Group", {"name": "Local", "supplier_group_name": "Local"})
    api.ensure("Item Group", {"name": "Products", "item_group_name": "Products"})
    api.ensure("UOM", {"name": "Nos", "uom_name": "Nos", "must_be_whole_number": 1})
    api.ensure("UOM", {"name": "Box", "uom_name": "Box", "must_be_whole_number": 1})
    company = api.ensure("Company", {"name": "E2E Demo Company", "company_name": "E2E Demo Company", "abbr": "E2E", "default_currency": "MXN", "country": "Mexico"})
    warehouse = api.ensure("Warehouse", {"name": "E2E Main Warehouse - E2E", "warehouse_name": "E2E Main Warehouse", "company": company["name"]})
    api.ensure("Customer", {"name": "E2E Customer", "customer_name": "E2E Customer", "customer_group": "Individual", "territory": "All Territories"})
    api.ensure("Supplier", {"name": "E2E Supplier", "supplier_name": "E2E Supplier", "supplier_group": "Local"})
    payment = api.ensure("Mode of Payment", {"name": "E2E Cash", "mode_of_payment": "E2E Cash", "type": "Cash", "enabled": 1})
    api.request("PUT", f"/api/resource/Mode%20of%20Payment/{quote(payment.get('name', 'E2E Cash'))}", {"accounts": [{"company": company["name"], "default_account": "Cash - E2E"}]})
    api.ensure("Item", {"name": "E2E Product", "item_code": "E2E Product", "item_name": "E2E Product", "item_group": "Products", "stock_uom": "Nos", "is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 1, "description": "Producto funcional para pruebas E2E"})
    api.ensure("Item", {"name": "E2E Product Pack", "item_code": "E2E Product Pack", "item_name": "E2E Product Pack", "item_group": "Products", "stock_uom": "Nos", "is_stock_item": 0, "is_sales_item": 1, "is_purchase_item": 1, "uoms": [{"uom": "Nos", "conversion_factor": 1}, {"uom": "Box", "conversion_factor": 10}]})
    api.ensure("Price List", {"name": "E2E Selling", "price_list_name": "E2E Selling", "selling": 1, "buying": 0, "enabled": 1})
    api.ensure("Price List", {"name": "E2E Buying", "price_list_name": "E2E Buying", "selling": 0, "buying": 1, "enabled": 1})
    selling_price = api.find_one("Item Price", [["item_code", "=", "E2E Product"], ["price_list", "=", "E2E Selling"]])
    if not selling_price:
        api.ensure("Item Price", {"item_code": "E2E Product", "price_list": "E2E Selling", "price_list_rate": 150, "selling": 1, "currency": "MXN", "uom": "Nos"})
    buying_price = api.find_one("Item Price", [["item_code", "=", "E2E Product"], ["price_list", "=", "E2E Buying"]])
    if not buying_price:
        api.ensure("Item Price", {"item_code": "E2E Product", "price_list": "E2E Buying", "price_list_rate": 80, "buying": 1, "currency": "MXN", "uom": "Nos"})
    api.ensure("POS Profile", {"name": "E2E POS Profile", "company": company["name"], "warehouse": warehouse["name"], "currency": "MXN", "selling_price_list": "E2E Selling", "customer": "E2E Customer", "write_off_account": "Write Off - E2E", "write_off_cost_center": "Main - E2E", "payments": [{"mode_of_payment": "E2E Cash", "default": 1}]})
    api.ensure("POS Settings", {"name": "POS Settings", "invoice_type": "Sales Invoice"})
    api.ensure("Fiscal Year", {"name": "2026", "year": "2026", "year_start_date": "2026-01-01", "year_end_date": "2026-12-31", "companies": [{"company": company["name"]}]})
    api.ensure("Sales Invoice", {"name": "E2E Draft Invoice", "customer": "E2E Customer", "company": company["name"], "currency": "MXN", "is_pos": 0, "items": [{"item_code": "E2E Product", "qty": 1, "rate": 150, "warehouse": warehouse["name"]}]})
    api.ensure("Sales Order", {"name": "E2E Draft Sales Order", "customer": "E2E Customer", "company": company["name"], "currency": "MXN", "transaction_date": time.strftime("%Y-%m-%d"), "delivery_date": time.strftime("%Y-%m-%d"), "items": [{"item_code": "E2E Product", "qty": 2, "rate": 150, "warehouse": warehouse["name"]}]})
    api.ensure("Quotation", {"name": "E2E Draft Quotation", "quotation_to": "Customer", "party_name": "E2E Customer", "company": company["name"], "currency": "MXN", "transaction_date": time.strftime("%Y-%m-%d"), "items": [{"item_code": "E2E Product", "qty": 1, "rate": 150}]})


def write_env(api_key: str, api_secret: str) -> None:
    ENV_FILE.write_text(
        "\n".join(
            [
                f"ERP_URL={BASE_URL}",
                f"ERP_SITE={SITE}",
                f"ERP_ADMIN_PASSWORD={ADMIN_PASSWORD}",
                f"E2E_ERP_API_KEY={api_key}",
                f"E2E_ERP_API_SECRET={api_secret}",
                "E2E_LOCAL_PASSPHRASE=e2e-local-passphrase",
                "",
            ]
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    try:
        wait_for_api()
        client = Api()
        client.login()
        seed(client)
        write_env(*generate_api_credentials(client))
        print(f"ERPNext listo: {BASE_URL}; fixtures y .env.erpnext.local creados")
    except Exception as error:
        print(f"Seed ERPNext falló: {error}", file=sys.stderr)
        sys.exit(1)
