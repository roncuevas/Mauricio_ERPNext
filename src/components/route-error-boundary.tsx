import { Component, type ErrorInfo, type ReactNode } from 'react'
import { Button, Notice } from './ui'

type RouteErrorBoundaryProps = {
  children: ReactNode
  onLock?: () => void
}

type RouteErrorBoundaryState = {
  error: Error | null
}

export class RouteErrorBoundary extends Component<RouteErrorBoundaryProps, RouteErrorBoundaryState> {
  state: RouteErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error de módulo o ruta', error, info.componentStack)
  }

  reload() {
    window.location.reload()
  }

  goToProducts() {
    window.location.assign('/items')
  }

  render() {
    if (!this.state.error) return this.props.children
    const detail = import.meta.env.DEV ? this.state.error.message : ''

    return <main className="flex min-h-[24rem] items-center justify-center p-6"><section className="card grid max-w-xl gap-4 p-6" role="alert"><div><h1 className="text-lg font-semibold">No se pudo cargar esta pantalla</h1><p className="mt-1 muted">El módulo falló antes de mostrar la vista. Puedes recargarlo o volver a Productos.</p></div>{detail && <Notice tone="warning">{detail}</Notice>}<div className="flex flex-wrap gap-2"><Button type="button" onClick={() => this.reload()}>Reintentar módulo</Button><Button type="button" variant="secondary" onClick={() => this.goToProducts()}>Ir a Productos</Button>{this.props.onLock && <Button type="button" variant="secondary" onClick={this.props.onLock}>Bloquear sesión</Button>}</div></section></main>
  }
}
