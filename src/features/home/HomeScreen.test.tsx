import { render, screen } from "@testing-library/react";
import { createMemoryHistory, createRootRoute, createRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { HomeScreen } from "./HomeScreen";
import "@testing-library/jest-dom";

describe("HomeScreen", () => {
  it("renders launcher cards", async () => {
    const root = createRootRoute({
      component: HomeScreen,
    });
    const index = createRoute({ getParentRoute: () => root, path: "/", component: HomeScreen });
    const router = createRouter({
      routeTree: root.addChildren([index]),
      history: createMemoryHistory({ initialEntries: ["/"] }),
    });
    render(<RouterProvider router={router} />);
    expect(await screen.findByText("What do you want to do?")).toBeInTheDocument();
    expect(screen.getAllByText("Read something").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Create audio").length).toBeGreaterThan(0);
    expect(screen.getByText("Create a voice")).toBeInTheDocument();
    expect(screen.getAllByText("Start dictating").length).toBeGreaterThan(0);
    expect(screen.getByText("Recent projects")).toBeInTheDocument();
  });
});
