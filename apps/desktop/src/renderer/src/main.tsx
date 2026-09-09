/**
 * @author Avesd
 * @package Desktop
 * @namespace Root
 * @description Main
 */

import "@avesd/ui/styles.css";
import "./styles.css";
import { App } from "./App";
import { startWorkbench } from "./workbench/runtime";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const rootElement = document.getElementById("root");

if (!rootElement) {
    throw new Error("Renderer root element was not found");
}

const render = async (): Promise<void> => {

    await startWorkbench();

    createRoot(rootElement).render(<StrictMode>
        <App />
    </StrictMode>);
};

void render();
