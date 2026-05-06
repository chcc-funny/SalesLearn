import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDebounce } from "@/hooks/use-debounce";

describe("useDebounce", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("初始值立即返回", () => {
    const { result } = renderHook(() => useDebounce("initial", 300));
    expect(result.current).toBe("initial");
  });

  it("value 改变后在 delay 时间之前不更新", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "hello", delay: 300 } }
    );

    rerender({ value: "world", delay: 300 });

    // delay 之前不更新
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe("hello");

    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(result.current).toBe("hello");
  });

  it("delay 时间后更新为最新值", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "hello", delay: 300 } }
    );

    rerender({ value: "world", delay: 300 });

    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("world");
  });

  it("连续改变 value → 只取最后一次（防抖合并）", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "a", delay: 300 } }
    );

    rerender({ value: "b", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "c", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    rerender({ value: "d", delay: 300 });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 300ms 内连续改变，防抖仍未触发
    expect(result.current).toBe("a");

    // 等待最后一次 delay 到期
    act(() => {
      vi.advanceTimersByTime(300);
    });

    expect(result.current).toBe("d");
  });

  it("delay 为 0 时，下一个 tick 就更新", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: "foo", delay: 0 } }
    );

    rerender({ value: "bar", delay: 0 });

    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(result.current).toBe("bar");
  });

  it("数字类型的 value 同样支持防抖", () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 1, delay: 500 } }
    );

    rerender({ value: 99, delay: 500 });

    act(() => {
      vi.advanceTimersByTime(499);
    });
    expect(result.current).toBe(1);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(99);
  });
});
