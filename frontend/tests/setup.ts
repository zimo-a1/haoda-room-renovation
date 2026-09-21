import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value() { this.setAttribute("open", ""); } });
Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value() { this.removeAttribute("open"); } });
Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:room-preview") });
Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
