use scemas_core::models::Severity;
use tauri::{
    AppHandle, Manager, Runtime,
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIcon, TrayIconBuilder},
};

use crate::sync::SyncTrigger;

pub struct AuthInfo {
    pub email: String,
    pub status: PlatformStatus,
}

#[derive(Default)]
pub enum PlatformStatus {
    #[default]
    Operational,
    Degraded,
    Down,
}

impl PlatformStatus {
    pub fn from_str(s: &str) -> Self {
        match s {
            "degraded" => Self::Degraded,
            "down" => Self::Down,
            _ => Self::Operational,
        }
    }

    fn label(&self) -> &'static str {
        match self {
            Self::Operational => "status: operational \u{25CF}",
            Self::Degraded => "status: degraded \u{25D0}",
            Self::Down => "status: down \u{25CB}",
        }
    }
}

pub fn create_tray<R: Runtime>(app: &AppHandle<R>) -> Result<TrayIcon<R>, tauri::Error> {
    let menu = build_menu(app, None)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .unwrap_or_else(|| severity_icon(None));

    let tray = TrayIconBuilder::with_id("scemas-tray")
        .icon(icon)
        .icon_as_template(true)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("SCEMAS - Environmental Monitoring")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "settings" => {
                show_main_window(app);
                navigate(app, "/settings");
            }
            "sign-in" => {
                show_main_window(app);
                navigate(app, "/sign-in");
            }
            "sync-now" => {
                if let Some(trigger) = app.try_state::<SyncTrigger>() {
                    trigger.notify_one();
                }
            }
            "sign-out" => {
                if let Some(window) = find_main_window(app) {
                    let _ = window.eval("window.__traySignOut && window.__traySignOut()");
                }
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .build(app)?;

    Ok(tray)
}

fn build_menu<R: Runtime>(
    app: &AppHandle<R>,
    session: Option<&AuthInfo>,
) -> Result<Menu<R>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let sep1 = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    if let Some(info) = session {
        let email = MenuItem::with_id(app, "email", &info.email, false, None::<&str>)?;
        let status = MenuItem::with_id(app, "status", info.status.label(), false, None::<&str>)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let sync_now = MenuItem::with_id(app, "sync-now", "Sync Now", true, None::<&str>)?;
        let settings = MenuItem::with_id(app, "settings", "Settings", true, None::<&str>)?;
        let sign_out = MenuItem::with_id(app, "sign-out", "Sign Out", true, None::<&str>)?;

        Menu::with_items(
            app,
            &[
                &show, &sep1, &email, &status, &sep2, &sync_now, &settings, &sign_out, &quit,
            ],
        )
    } else {
        let sign_in = MenuItem::with_id(app, "sign-in", "Sign In", true, None::<&str>)?;
        Menu::with_items(app, &[&show, &sep1, &sign_in, &quit])
    }
}

pub fn update_auth_menu<R: Runtime>(app: &AppHandle<R>, session: Option<AuthInfo>) {
    if let Some(tray) = app.tray_by_id("scemas-tray") {
        if let Ok(menu) = build_menu(app, session.as_ref()) {
            let _ = tray.set_menu(Some(menu));
        }
    }
}

fn find_main_window<R: Runtime>(app: &AppHandle<R>) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = find_main_window(app) {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn navigate<R: Runtime>(app: &AppHandle<R>, route: &str) {
    if let Some(window) = find_main_window(app) {
        let _ = window.eval(&format!(
            "window.history.pushState({{}}, '', '{route}'); \
             window.dispatchEvent(new PopStateEvent('popstate'))"
        ));
    }
}

fn severity_icon(max_severity: Option<Severity>) -> Image<'static> {
    let (r, g, b) = match max_severity {
        Some(Severity::Critical) => (0xdcu8, 0x26u8, 0x26u8),
        Some(Severity::Warning) => (0xd9u8, 0x77u8, 0x06u8),
        Some(Severity::Low) | None => (0x16u8, 0xa3u8, 0x4au8),
    };
    let size = 16usize;
    let mut rgba = Vec::with_capacity(size * size * 4);
    for _ in 0..(size * size) {
        rgba.extend_from_slice(&[r, g, b, 255]);
    }
    Image::new_owned(rgba, size as u32, size as u32)
}

pub fn update_severity_icon<R: Runtime>(app: &AppHandle<R>, max_severity: Option<Severity>) {
    if let Some(tray) = app.tray_by_id("scemas-tray") {
        let _ = tray.set_icon(Some(severity_icon(max_severity)));
    }
}
