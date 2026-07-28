(() => {
  const button = document.querySelector("#web-push-toggle");
  const note = document.querySelector("#web-push-status");
  if (!button || !note) return;

  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const setState = (text, enabled = false) => {
    note.textContent = text;
    button.textContent = enabled ? "已开启" : "开启";
    button.dataset.enabled = enabled ? "1" : "0";
  };
  const decodeKey = (value) => {
    const padding = "=".repeat((4 - value.length % 4) % 4);
    const bytes = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
    return Uint8Array.from(bytes, (char) => char.charCodeAt(0));
  };
  const api = (path, options) => window.LumiereAPI.request(path, options);

  async function refresh() {
    if (!supported) return setState("当前系统不支持应用通知");
    if (ios && !standalone) return setState("请先从桌面上的 Lumière 图标打开，再开启通知");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) return setState("来电会直接唤醒 Lumière", true);
      if (Notification.permission === "denied") return setState("通知权限已被系统关闭");
      const status = await api("/web-push/status");
      setState(status.configured ? "开启后，点击来电通知会回到本应用" : "服务器尚未配置 Web Push");
    } catch {
      setState("通知状态暂时无法读取");
    }
  }

  async function enable() {
    if (ios && !standalone) throw new Error("请从桌面上的 Lumière 图标打开后再开启");
    const status = await api("/web-push/status");
    if (!status.configured || !status.publicKey) throw new Error("服务器尚未配置 Web Push");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") throw new Error("你没有允许 Lumière 发送通知");
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription = existing || await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: decodeKey(status.publicKey)
    });
    await api("/web-push/subscribe", {
      method: "POST",
      body: JSON.stringify({ subscription: subscription.toJSON() })
    });
    setState("来电会直接唤醒 Lumière", true);
  }

  async function disable() {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await api("/web-push/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ endpoint: subscription.endpoint })
      });
      await subscription.unsubscribe();
    }
    setState("应用来电通知已关闭");
  }

  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (button.dataset.enabled === "1") await disable();
      else await enable();
    } catch (error) {
      setState(error.message || "通知设置失败");
    } finally {
      button.disabled = false;
    }
  });
  window.addEventListener("lumiere:ready", refresh);
  window.addEventListener("load", refresh);
})();
