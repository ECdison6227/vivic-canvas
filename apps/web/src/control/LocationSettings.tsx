import { useEffect, useState, useSyncExternalStore } from "react";
import { MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getLocationSnapshot, startLocation, stopLocation, subscribeLocation, type LocationSnapshot } from "@/location/deviceLocation";

const time = (iso: string) => new Date(iso).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
const statusText = (snapshot: LocationSnapshot): string => {
  switch (snapshot.status) {
    case "watching": return snapshot.fix
      ? `实时定位中 · 精度约 ${Math.max(1, Math.round(snapshot.fix.accuracyM))} 米 · ${time(snapshot.fix.capturedAt)} 更新`
      : "实时定位中…";
    case "locating": return "正在获取位置…（首次会弹出浏览器的位置授权）";
    case "off": return "未开启。问“今天天气如何”时会请求一次授权；未授权时按网络大致位置回答。";
    default: return snapshot.error ?? "无法定位。";
  }
};

/** Control-only. Positions are never shown on Display or written to the canvas beyond ~1 km weather coordinates. */
export const LocationSettings = ({ disabled }: { disabled: boolean }) => {
  const snapshot = useSyncExternalStore(subscribeLocation, getLocationSnapshot);
  // Re-render each minute so the "updated at" line does not look frozen between fixes.
  const [, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick(n => n + 1), 60_000); return () => clearInterval(timer); }, []);
  const on = snapshot.status === "watching" || snapshot.status === "locating";
  return <section className="rounded-xl border border-neutral-200 bg-white p-4" data-vivic-location data-status={snapshot.status}>
    <div className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />位置</div>
    <p className="mt-2 text-xs text-neutral-500">
      用系统定位（GPS／Wi-Fi）回答“这里天气”，天气卡会随你移动或每 15 分钟自动更新。位置只在本页内存中使用，发出前取整到约 1 公里；画布只记录城市名和取整坐标。
    </p>
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" disabled={disabled || snapshot.status === "unsupported"} aria-pressed={on}
        data-vivic-location-toggle onClick={() => on ? stopLocation() : startLocation()}>
        {on ? "关闭实时定位" : "开启实时定位"}
      </Button>
      <span className="text-xs text-neutral-600" role="status" data-vivic-location-status>{statusText(snapshot)}</span>
    </div>
  </section>;
};
