import { getCurrentWindow } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emit } from "@tauri-apps/api/event";

/**
 * 检查是否在 Tauri 桌面端运行
 */
export function isTauriEnv(): boolean {
  return typeof window !== "undefined" && Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
}

/**
 * 最小化窗口
 */
export async function minimizeWindow(): Promise<void> {
  if (isTauriEnv()) {
    try {
      await getCurrentWindow().minimize();
    } catch (err) {
      console.warn("最小化窗口失败:", err);
    }
  }
}

/**
 * 关闭窗口（托盘常驻模式下，点击关闭为隐藏主窗口）
 */
export async function closeWindow(): Promise<void> {
  if (isTauriEnv()) {
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn("隐藏窗口失败:", err);
    }
  }
}

/**
 * 唤醒独立的透明全屏 alert 窗口
 */
export async function triggerAlertWindow(message: string): Promise<void> {
  if (isTauriEnv()) {
    try {
      // 1. 发送全局事件传递消息内容
      await emit("show-alert-msg", { message });

      // 2. 唤醒并置顶全屏窗口
      const alertWin = await WebviewWindow.getByLabel("alert");
      if (alertWin) {
        await alertWin.show();
        await alertWin.setFocus();
        await alertWin.setAlwaysOnTop(true);
      }
    } catch (err) {
      console.warn("唤醒独立全屏窗口异常:", err);
    }
  }
}

/**
 * 隐藏全屏 alert 窗口
 */
export async function hideAlertWindow(): Promise<void> {
  if (isTauriEnv()) {
    try {
      await getCurrentWindow().hide();
    } catch (err) {
      console.warn("隐藏全屏窗口失败:", err);
    }
  }
}
