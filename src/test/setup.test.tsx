/**
 * Proves the component-test setup works before anything depends on it.
 *
 * This repository had no React component tests at all — every suite was pure
 * TypeScript. The block renderers in stage 3 are the first components worth testing, and
 * without this they would ship on visual comparison alone. Each assertion here covers
 * one piece of wiring that is annoying to debug from a failing block test.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useNavigate } from "react-router-dom";
import Badge from "@cloudscape-design/components/badge";

describe("the component test environment", () => {
  it("renders a component and queries it", () => {
    render(<p>hello</p>);

    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("provides jest-dom matchers", () => {
    // `toBeInTheDocument` above would pass as a plain truthiness check if the matchers
    // were not loaded; this one would not.
    render(<button disabled>Save</button>);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("cleans the DOM between tests", () => {
    // If cleanup were not wired up, the <p>hello</p> from the first test would still be
    // mounted and this would find it.
    expect(screen.queryByText("hello")).not.toBeInTheDocument();
  });

  it("handles user interaction and state updates", async () => {
    function Counter() {
      const [n, setN] = useState(0);
      return <button onClick={() => setN(n + 1)}>count {n}</button>;
    }
    render(<Counter />);

    await userEvent.click(screen.getByRole("button"));

    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
  });

  it("renders Cloudscape components", () => {
    // Cloudscape pulls in CSS modules and design tokens; a block renderer test would
    // fail confusingly if that did not resolve under jsdom.
    render(<Badge color="green">CMST 388</Badge>);

    expect(screen.getByText("CMST 388")).toBeInTheDocument();
  });

  it("routes with react-router", async () => {
    // Every block that renders an internal link needs a router in scope, so confirm
    // MemoryRouter works and navigation actually changes what is rendered.
    function Start() {
      const navigate = useNavigate();
      return <button onClick={() => navigate("/there")}>go</button>;
    }
    render(
      <MemoryRouter initialEntries={["/"]}>
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/there" element={<p>arrived</p>} />
        </Routes>
      </MemoryRouter>
    );

    await userEvent.click(screen.getByRole("button", { name: "go" }));

    expect(screen.getByText("arrived")).toBeInTheDocument();
  });
});
