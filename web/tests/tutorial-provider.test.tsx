import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { TutorialProvider, useTutorial } from "@/features/tutorial/tutorial-provider";

function Harness() {
  const tutorial = useTutorial();
  return (
    <div>
      <output>{`${tutorial.state.status}:${tutorial.state.step}:${tutorial.state.isReplay}`}</output>
      <button onClick={tutorial.startTutorial}>start</button>
      <button onClick={tutorial.replayTutorial}>replay</button>
      <button onClick={tutorial.nextStep}>next</button>
      <button onClick={() => tutorial.completeStep("open-territory")}>complete territory</button>
      <button onClick={tutorial.skipTutorial}>skip</button>
      <button onClick={tutorial.completeTutorial}>complete</button>
    </div>
  );
}

describe("TutorialProvider", () => {
  it("starts, advances through, and completes the tutorial", async () => {
    const user = userEvent.setup();
    render(<TutorialProvider storage={window.localStorage}><Harness /></TutorialProvider>);

    await user.click(screen.getByRole("button", { name: "start" }));
    expect(screen.getByText("running:choose-fandom:false")).toBeInTheDocument();
  });

  it("supports replay and skipping", async () => {
    const user = userEvent.setup();
    render(<TutorialProvider storage={window.localStorage}><Harness /></TutorialProvider>);

    await user.click(screen.getByRole("button", { name: "replay" }));
    expect(screen.getByText("running:choose-fandom:true")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "skip" }));
    expect(screen.getByText("skipped:choose-fandom:true")).toBeInTheDocument();
  });

  it("advances only when the completed step is current", async () => {
    const user = userEvent.setup();
    render(<TutorialProvider storage={window.localStorage}><Harness /></TutorialProvider>);

    await user.click(screen.getByRole("button", { name: "start" }));
    await user.click(screen.getByRole("button", { name: "complete territory" }));
    expect(screen.getByText("running:choose-fandom:false")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "next" }));
    expect(screen.getByText("running:open-territory:false")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "complete territory" }));
    expect(screen.getByText("running:start-expedition:false")).toBeInTheDocument();
  });
});