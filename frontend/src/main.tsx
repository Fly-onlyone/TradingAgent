import CssBaseline from "@mui/material/CssBaseline";
import {ThemeProvider} from "@mui/material/styles";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createRouter, RouterProvider} from "@tanstack/react-router";
import {StrictMode} from "react";
import ReactDOM from "react-dom/client";
import reportWebVitals from "./reportWebVitals.ts";

// Import the generated route tree
import {routeTree} from "./routeTree.gen";
// Import theme
import {theme} from "./theme";
import {initializeFrontendLogging} from "./utils/frontendLogger";

// Create React Query client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            gcTime: 1000 * 60 * 10, // 10 minutes
            retry: 1,
            refetchOnMount: false,
            refetchOnWindowFocus: false,
        },
    },
});

// Create a new router instance
const router = createRouter({
    routeTree,
    context: {},
    defaultPreload: false,
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 30_000,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

initializeFrontendLogging();

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <ThemeProvider theme={theme}>
                    <CssBaseline/>
                    <RouterProvider router={router}/>
                </ThemeProvider>
            </QueryClientProvider>
        </StrictMode>,
    );
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
