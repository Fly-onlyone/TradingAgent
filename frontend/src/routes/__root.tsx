import { Outlet, createRootRoute } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import { TanStackDevtools } from '@tanstack/react-devtools'
import { AnimatePresence } from 'framer-motion'

import { AppShell } from '../components/layout/AppShell'
import { ErrorBoundary } from '../components/common/ErrorBoundary'

export const Route = createRootRoute({
  component: () => (
    <ErrorBoundary>
      <AppShell>
        <AnimatePresence mode="wait">
          <Outlet />
        </AnimatePresence>
      </AppShell>
      <TanStackDevtools
        config={{
          position: 'bottom-right',
        }}
        plugins={[
          {
            name: 'Tanstack Router',
            render: <TanStackRouterDevtoolsPanel />,
          },
        ]}
      />
    </ErrorBoundary>
  ),
})
