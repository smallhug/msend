import { useState, useEffect, useRef } from "react";
import QRCode from "qrcode";
import { listen } from "@tauri-apps/api/event";
import { playAlertChime, speakMessage } from "./utils/sound";
import {
  minimizeWindow,
  closeWindow,
  triggerAlertWindow,
  hideAlertWindow,
} from "./utils/windowControl";
import "./App.css";

interface AlertRecord {
  id: string;
  message: string;
  time: string;
}

// 生成12位随机小写字母加数字的主题
function generateRandomTopic(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 12; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// ==========================================
// 独立全屏透明告警窗口组件 (Overlay Window)
// ==========================================
interface AlertItem {
  id: string;
  message: string;
  time: string;
}

function AlertWindow() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);

  const handleDismiss = async () => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setAlerts([]);
    await hideAlertWindow();
  };

  useEffect(() => {
    // 监听键盘 ESC 键退出，阻止 Alt/F10 触发 Windows 系统菜单栏
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleDismiss();
      } else if (e.key === "Alt" || e.key === "F10") {
        e.preventDefault();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    // 监听主窗口发来的全局消息事件
    const unlistenPromise = listen<{ message: string }>("show-alert-msg", (event) => {
      const msg = event.payload.message;
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
        .getMinutes()
        .toString()
        .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      const newItem: AlertItem = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        message: msg,
        time: timeStr,
      };

      // 方案一：新消息自动追加在队列后方，未关闭的旧消息绝不被覆盖
      setAlerts((prev) => [...prev, newItem]);

      // 读取设置中的声音开关
      const enableChime = localStorage.getItem("ntfy_enable_chime") !== "false";
      const enableTts = localStorage.getItem("ntfy_enable_tts") === "true";

      if (enableChime) {
        playAlertChime();
      }
      if (enableTts) {
        setTimeout(() => {
          speakMessage(msg);
        }, enableChime ? 350 : 50);
      }
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  // 根据文本长度与多条并存情况智能适配最佳展示字号
  const getTextSizeClass = (len: number, totalCount: number) => {
    if (totalCount > 1 || len > 160) return "text-dense";
    if (len > 60) return "text-medium";
    return "text-large";
  };

  if (alerts.length === 0) return null;

  return (
    <div className="alert-overlay">
      <div className="alert-content-box">
        <div className="alert-text-container">
          {alerts.map((item, idx) => (
            <div key={item.id} className="alert-stream-item">
              <div className="alert-stream-header">
                <span className="alert-stream-badge">#{idx + 1}</span>
                <span className="alert-stream-time">{item.time}</span>
              </div>
              <p className={`alert-text ${getTextSizeClass(item.message.length, alerts.length)}`}>
                {item.message}
              </p>
            </div>
          ))}
        </div>
        <button className="btn-close-alert" onClick={handleDismiss}>
          {alerts.length > 1 ? `关闭 (共 ${alerts.length} 条)` : "关闭"}
        </button>
      </div>
    </div>
  );
}

// ==========================================
// 主窗口组件 (400x600 固定尺寸控制台)
// ==========================================
function MainWindow() {
  // 12位主题状态
  const [topic, setTopic] = useState<string>(() => {
    const saved = localStorage.getItem("ntfy_topic");
    if (saved && /^[a-zA-Z0-9]{12}$/.test(saved)) {
      return saved;
    }
    const fresh = generateRandomTopic();
    localStorage.setItem("ntfy_topic", fresh);
    return fresh;
  });
  const [isEditingTopic, setIsEditingTopic] = useState(false);
  const [tempTopic, setTempTopic] = useState(topic);
  const [connStatus, setConnStatus] = useState<"connected" | "connecting" | "error">("connecting");
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const [copied, setCopied] = useState(false);

  // 语音朗读与提示音开关（语音朗读默认关闭）
  const [enableTts, setEnableTts] = useState<boolean>(() => {
    return localStorage.getItem("ntfy_enable_tts") === "true";
  });
  const [enableChime, setEnableChime] = useState<boolean>(() => {
    return localStorage.getItem("ntfy_enable_chime") !== "false";
  });

  // 接收历史
  const [history, setHistory] = useState<AlertRecord[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("ntfy_history_simple") || "[]");
    } catch {
      return [];
    }
  });

  // 长文本就地展开/折叠状态
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleSpeakOnly = (e: React.MouseEvent, text: string) => {
    e.stopPropagation();
    speakMessage(text);
  };

  const handleDeleteItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActiveTimeRef = useRef<number>(Date.now());
  const lastHeartbeatTickRef = useRef<number>(Date.now());
  const phoneUrl = `https://ntfy.sh/${topic}`;

  // 保存偏好
  useEffect(() => {
    localStorage.setItem("ntfy_enable_tts", String(enableTts));
  }, [enableTts]);

  useEffect(() => {
    localStorage.setItem("ntfy_enable_chime", String(enableChime));
  }, [enableChime]);

  useEffect(() => {
    localStorage.setItem("ntfy_topic", topic);
  }, [topic]);

  useEffect(() => {
    localStorage.setItem("ntfy_history_simple", JSON.stringify(history.slice(0, 15)));
  }, [history]);

  // 生成二维码 (250px 正方形)
  useEffect(() => {
    QRCode.toDataURL(phoneUrl, {
      width: 250,
      margin: 1,
      color: {
        dark: "#0f172a",
        light: "#ffffff",
      },
    })
      .then((url) => setQrCodeUrl(url))
      .catch((err) => console.error("二维码生成失败:", err));
  }, [phoneUrl]);

  // 触发消息处理：存入历史并唤醒独立全屏透明窗口
  const handleIncomingMessage = (msg: string) => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, "0")}:${now
      .getMinutes()
      .toString()
      .padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    const record: AlertRecord = {
      id: `${Date.now()}`,
      message: msg,
      time: timeStr,
    };

    setHistory((prev) => [record, ...prev.slice(0, 14)]);

    // 唤醒独立的透明全屏 alert 窗口
    triggerAlertWindow(msg);
  };

  // ntfy.sh SSE 长连接监听与系统休眠唤醒 / 断网重连心跳检测
  useEffect(() => {
    let isDisposed = false;

    // 清理现有重连定时器
    const clearReconnect = () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };

    // 执行建立连接
    const connect = () => {
      if (isDisposed) return;
      clearReconnect();

      if (!navigator.onLine) {
        setConnStatus("error");
        return;
      }

      setConnStatus("connecting");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      try {
        const sse = new EventSource(`https://ntfy.sh/${encodeURIComponent(topic)}/sse`);
        eventSourceRef.current = sse;

        sse.onopen = () => {
          if (isDisposed) return;
          setConnStatus("connected");
          lastActiveTimeRef.current = Date.now();
        };

        sse.onmessage = (e) => {
          if (isDisposed) return;
          lastActiveTimeRef.current = Date.now();
          try {
            const payload = JSON.parse(e.data);
            if (payload.event === "message" && payload.message) {
              handleIncomingMessage(payload.message);
            }
          } catch (err) {
            console.error("解析消息失败:", err);
          }
        };

        sse.onerror = () => {
          if (isDisposed) return;
          setConnStatus("error");
          // 若底层异常且尚未安排重连，延迟2秒尝试重连
          if (!reconnectTimerRef.current && navigator.onLine) {
            reconnectTimerRef.current = setTimeout(() => {
              connect();
            }, 2000);
          }
        };
      } catch (err) {
        console.error("创建 SSE 失败:", err);
        setConnStatus("error");
        if (!reconnectTimerRef.current && navigator.onLine) {
          reconnectTimerRef.current = setTimeout(() => {
            connect();
          }, 3000);
        }
      }
    };

    // 初始连接
    connect();

    // 1. 网络离线/上线监听
    const handleOnline = () => {
      console.log("检测到网络恢复连接，立即重连...");
      connect();
    };

    const handleOffline = () => {
      console.log("检测到网络已断开...");
      setConnStatus("error");
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // 2. 电脑休眠唤醒与假死连接心跳检测
    // 每 2 秒心跳检测一次时间跳变（检测休眠唤醒）和长连接健康状态
    lastHeartbeatTickRef.current = Date.now();
    lastActiveTimeRef.current = Date.now();

    heartbeatTimerRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedSinceLastTick = now - lastHeartbeatTickRef.current;
      lastHeartbeatTickRef.current = now;

      // 电脑休眠判定：两次心跳间隔远超设定的 2000ms（如出现大于 5500ms 的断层），证明系统刚经历过休眠/挂起
      if (elapsedSinceLastTick > 5500) {
        console.log(`检测到系统休眠唤醒 (跳跃 ${elapsedSinceLastTick}ms)，立即重建长连接...`);
        connect();
        return;
      }

      // 假死僵尸连接判定：处于连接状态但超过 75 秒既无消息也无心跳，且网络可用
      if (
        navigator.onLine &&
        eventSourceRef.current &&
        eventSourceRef.current.readyState === EventSource.OPEN &&
        now - lastActiveTimeRef.current > 75000
      ) {
        console.log("连接可能已处于半开假死状态，主动重置长连接...");
        connect();
        return;
      }

      // 如果当前状态处于断开且网络已可用，但尚未安排重试，主动尝试拉起
      if (
        navigator.onLine &&
        (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) &&
        !reconnectTimerRef.current
      ) {
        connect();
      }
    }, 2000);

    return () => {
      isDisposed = true;
      clearReconnect();
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [topic]);

  const copyUrl = () => {
    navigator.clipboard.writeText(phoneUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="window-container">
      {/* 自定义顶部栏 (Frameless Titlebar) */}
      <div className="titlebar" data-tauri-drag-region>
        <div className="titlebar-title" data-tauri-drag-region>
          <div className="brand-icon" data-tauri-drag-region>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f172a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="22 2 15 22 11 13 2 9 22 2" fill="#ffffff" />
              <polygon points="11 13 15 22 13.5 17" fill="#e2e8f0" />
              <line x1="22" y1="2" x2="11" y2="13" />
            </svg>
          </div>
          <span className={`conn-tag ${connStatus}`}>
            {connStatus === "connected" && "在线"}
            {connStatus === "connecting" && (
              <svg className="conn-spinner" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
              </svg>
            )}
            {connStatus === "error" && "离线"}
          </span>
        </div>

        {/* 顶部栏右侧工具区：矢量图标切换 + 窗口控制 */}
        <div className="titlebar-right">
          {/* 纯矢量图标开关：提示音 */}
          <button
            className={`action-icon-btn ${enableChime ? "active" : "inactive"}`}
            onClick={() => setEnableChime(!enableChime)}
            title={enableChime ? "提示音：开启" : "提示音：已静音"}
          >
            {enableChime ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                <line x1="2" y1="2" x2="22" y2="22" />
              </svg>
            )}
          </button>

          {/* 纯矢量图标开关：语音朗读 (TTS) */}
          <button
            className={`action-icon-btn ${enableTts ? "active" : "inactive"}`}
            onClick={() => setEnableTts(!enableTts)}
            title={enableTts ? "语音朗读：开启" : "语音朗读：已关闭"}
          >
            {enableTts ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </svg>
            )}
          </button>

          <div className="titlebar-divider" />

          {/* 窗口控制按钮群（缩小与关闭） */}
          <div className="titlebar-controls">
            <button
              className="titlebar-btn btn-minimize"
              title="最小化"
              onClick={() => minimizeWindow()}
            >
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>
            <button
              className="titlebar-btn btn-close"
              title="关闭"
              onClick={() => closeWindow()}
            >
              <svg width="10" height="10" viewBox="0 0 10 10">
                <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 主界面内容区（宽400x高600适配） */}
      <div className="main-content">
        {/* 上方：手机发送端卡片 */}
        <div className="panel left-panel">
          <div className="qr-wrapper">
            {qrCodeUrl ? (
              <img src={qrCodeUrl} alt="扫码发送" className="qr-img" />
            ) : (
              <div className="qr-empty">生成中...</div>
            )}
          </div>

          <div className="topic-bar">
            <div className="topic-view">
              {/* 原位字符串展示与输入框 */}
              {isEditingTopic ? (
                <input
                  type="text"
                  maxLength={12}
                  value={tempTopic}
                  autoFocus
                  onChange={(e) => setTempTopic(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const clean = tempTopic.trim();
                      if (clean) {
                        setTopic(clean);
                        setIsEditingTopic(false);
                      }
                    } else if (e.key === "Escape") {
                      setIsEditingTopic(false);
                    }
                  }}
                  className="topic-val topic-input-inline"
                  placeholder="12位主题"
                />
              ) : (
                <span className="topic-val">{topic}</span>
              )}

              {/* 按钮区域 */}
              {isEditingTopic ? (
                <div className="topic-actions">
                  <button
                    className="btn-icon btn-save"
                    title="保存 (Enter)"
                    onClick={() => {
                      const clean = tempTopic.trim();
                      if (clean) {
                        setTopic(clean);
                        setIsEditingTopic(false);
                      }
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </button>
                  <button
                    className="btn-icon btn-cancel"
                    title="取消 (ESC)"
                    onClick={() => setIsEditingTopic(false)}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>
              ) : (
                /* 按钮顺序：1.编辑、2.刷新、3.链接 (间距15px) */
                <div className="topic-actions">
                  <button
                    className="btn-icon"
                    title="编辑主题"
                    onClick={() => {
                      setTempTopic(topic);
                      setIsEditingTopic(true);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>

                  <button
                    className="btn-icon"
                    title="刷新生成随机新主题"
                    onClick={() => {
                      const nt = generateRandomTopic();
                      setTopic(nt);
                      setTempTopic(nt);
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                  </button>

                  <button
                    className={`btn-icon ${copied ? "copied" : ""}`}
                    title={copied ? "已复制发送链接 ✓" : "复制发送链接"}
                    onClick={copyUrl}
                  >
                    {copied ? (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    ) : (
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 下方：接收消息历史 */}
        <div className="panel right-panel">
          <div className="history-header">
            <span className="panel-title">接收记录 ({history.length})</span>
            {history.length > 0 && (
              <button className="btn-clear" onClick={() => setHistory([])}>
                清空
              </button>
            )}
          </div>

          <div className="history-items">
            {history.length === 0 ? (
              <div className="no-history">暂无消息，请用手机扫码发送</div>
            ) : (
              history.map((item) => (
                <div
                  key={item.id}
                  className={`history-row ${expandedId === item.id ? "expanded" : ""}`}
                  onClick={() => handleToggleExpand(item.id)}
                  title={expandedId === item.id ? "点击收起全文" : "点击就地展开全文"}
                >
                  <span className="h-time">{item.time}</span>
                  <span className="h-msg">{item.message}</span>

                  <div className="h-actions">
                    <button
                      className="btn-mini-action"
                      title="朗读此条"
                      onClick={(e) => handleSpeakOnly(e, item.message)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                      </svg>
                    </button>
                    <button
                      className="btn-mini-action danger"
                      title="删除该条记录"
                      onClick={(e) => handleDeleteItem(e, item.id)}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 根组件：根据URL参数区分是主窗口还是全屏Alert窗口
// ==========================================
export default function App() {
  const isAlertWindow = typeof window !== "undefined" && window.location.search.includes("win=alert");

  return isAlertWindow ? <AlertWindow /> : <MainWindow />;
}
