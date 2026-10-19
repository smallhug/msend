use tauri::{
    menu::{CheckMenuItem, Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::ManagerExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .setup(|app| {
            // 获取开机自启动初始状态
            let auto_launch = app.autolaunch();
            let is_autostart_enabled = auto_launch.is_enabled().unwrap_or(false);

            // 彻底移除所有窗口的默认系统菜单栏（彻底避免 Windows 弹出 "文件(F) 编辑(E)" 等标题/菜单栏）
            let _ = app.remove_menu();
            if let Some(alert_window) = app.get_webview_window("alert") {
                let _ = alert_window.remove_menu();
            }
            if let Some(main_window) = app.get_webview_window("main") {
                let _ = main_window.remove_menu();
            }

            // 检查启动参数：若携带 --autostart 参数则为静默启动（保持窗口隐藏并常驻托盘）
            let args: Vec<String> = std::env::args().collect();
            let is_autostart_boot = args.iter().any(|arg| arg == "--autostart");

            // 如果非自启动（用户主动手动启动应用），则显示并聚焦主窗口
            if !is_autostart_boot {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.unminimize();
                    let _ = window.set_focus();
                }
            }

            // 托盘右键菜单项
            let show_i = MenuItem::with_id(app, "show_main", "显示主界面", true, None::<&str>)?;
            let autostart_i = CheckMenuItem::with_id(
                app,
                "toggle_autostart",
                "开机自启动",
                true,
                is_autostart_enabled,
                None::<&str>,
            )?;
            let quit_i = MenuItem::with_id(app, "quit_app", "退出", true, None::<&str>)?;

            let menu = Menu::with_items(app, &[&show_i, &autostart_i, &quit_i])?;

            let autostart_item_clone = autostart_i.clone();

            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show_main" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.unminimize();
                                let _ = window.set_focus();
                            }
                        }
                        "toggle_autostart" => {
                            let auto_launch = app.autolaunch();
                            if let Ok(enabled) = auto_launch.is_enabled() {
                                if enabled {
                                    if auto_launch.disable().is_ok() {
                                        let _ = autostart_item_clone.set_checked(false);
                                    }
                                } else {
                                    if auto_launch.enable().is_ok() {
                                        let _ = autostart_item_clone.set_checked(true);
                                    }
                                }
                            }
                        }
                        "quit_app" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.unminimize();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
