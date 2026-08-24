import { render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { AppRail } from "./AppRail";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@testing-library/jest-dom";

function renderRail(path = "/") {
  const root = createRootRoute({
    component: () => (
      <TooltipProvider>
        <AppRail collapsed={false} snapshot={{ active: { tts: "qwen3" } }} />
      </TooltipProvider>
    ),
  });
  const index = createRoute({ getParentRoute: () => root, path: "/", component: () => null });
  const router = createRouter({
    routeTree: root.addChildren([index]),
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

describe("AppRail", () => {
  it("shows OrbSpeak wordmark and main destinations", async () => {
    renderRail("/");
    expect(await screen.findByText("ORBSPEAK")).toBeInTheDocument();
    expect(screen.getByText("Private AI Voice Platform")).toBeInTheDocument();
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("Reader")).toBeInTheDocument();
    expect(screen.getByText("Studio")).toBeInTheDocument();
    expect(screen.getByText("Voices")).toBeInTheDocument();
    expect(screen.getByText("Dictation")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText(/Qwen Local/)).toBeInTheDocument();
  });
});
