import {Outlet, createRootRoute} from '@tanstack/react-router'

import {AppShell} from '../components/layout/AppShell'
import {ErrorBoundary} from '../components/common/ErrorBoundary'

export const Route = createRootRoute({
    component: () => (
        <ErrorBoundary>
            <AppShell>
                <Outlet/>
            </AppShell>
        </ErrorBoundary>
    ),
})
