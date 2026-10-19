import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

// 除输入框外全局禁用复制
document.addEventListener(
  "copy",
  (e) => {
    const target = e.target as HTMLElement | null;
    const isInput =
      target &&
      (target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable);
    if (!isInput) {
      e.preventDefault();
    }
  },
  { capture: true }
);

// 全局禁用右键菜单
document.addEventListener(
  "contextmenu",
  (e) => {
    e.preventDefault();
  },
  { capture: true }
);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
