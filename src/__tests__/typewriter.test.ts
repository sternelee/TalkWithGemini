import { describe, expect, it } from "vitest";
import { getNextTypewriterFrame } from "../lib/utils/typewriter";

describe("typewriter frame helper", () => {
  it("advances by a bounded chunk", () => {
    expect(getNextTypewriterFrame("hello", "hello world")).toEqual({
      content: "hello worl",
      done: false,
    });
  });

  it("marks the frame done when target content is reached", () => {
    expect(getNextTypewriterFrame("hello worl", "hello world")).toEqual({
      content: "hello world",
      done: true,
    });
    expect(getNextTypewriterFrame("hello world", "hello world")).toEqual({
      content: "hello world",
      done: true,
    });
  });

  it("resets safely when the target no longer starts with the current text", () => {
    expect(getNextTypewriterFrame("previous answer", "new")).toEqual({
      content: "new",
      done: true,
    });
  });

  it("clears empty targets", () => {
    expect(getNextTypewriterFrame("old", "")).toEqual({
      content: "",
      done: true,
    });
  });
});
