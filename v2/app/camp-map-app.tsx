"use client";

import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing, CheckCircle2, ClipboardCheck, Crosshair, ListFilter, LocateFixed, MapPin, Navigation, Plus, RefreshCw, ShieldCheck, TriangleAlert, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type CampStatus = "active" | "needs_check" | "inactive";
type Verdict = "still_here" | "not_there" | "needs_followup";
type Coordinates = { latitude: number; longitude: number };
type Filter = "open" | CampStatus;
type Camp = {
  id: number;
  label: string;
  notes: string;
  latitude: number;
  longitude: number;
  status: CampStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  lastConfirmedAt: string | null;
  confirmationCount: number;
};

const FRESNO_CENTER: Coordinates = { latitude: 36.7378, longitude: -119.7871 };
const FILTERS: Filter[] = ["open", "active", "needs_check", "inactive"];
const statusCopy: Record<CampStatus, string> = {
  active: "Confirmed active",
  needs_check: "Needs a check",
  inactive: "No longer there",
};
const statusStyles: Record<CampStatus, string> = {
  active: "bg-[#0d9f6e] text-white",
  needs_check: "bg-[#f6bd3b] text-[#1e2b2a]",
  inactive: "bg-[#60706e] text-white",
};

function distanceMeters(a: Coordinates, b: Coordinates) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const latitudeDelta = radians(b.latitude - a.latitude);
  const longitudeDelta = radians(b.longitude - a.longitude);
  const firstLatitude = radians(a.latitude);
  const secondLatitude = radians(b.latitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDelta / 2) ** 2;
  return 6_371_000 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

function distanceLabel(meters: number) {
  const feet = meters * 3.28084;
  return feet < 1000 ? `${Math.round(feet)} ft away` : `${(feet / 5280).toFixed(1)} mi away`;
}

function timeLabel(value: string | null) {
  if (!value) return "Not confirmed yet";
  const timestamp = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const hours = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 3_600_000));
  if (hours < 1) return "Confirmed less than an hour ago";
  if (hours < 24) return `Confirmed ${hours}h ago`;
  return `Confirmed ${Math.floor(hours / 24)}d ago`;
}

function MapSurface({ camps, userPosition, selectedId, onSelect, onMapCenter }: {
  camps: Camp[];
  userPosition: Coordinates | null;
  selectedId: number | null;
  onSelect: (camp: Camp) => void;
  onMapCenter: (coordinates: Coordinates) => void;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerLayer = useRef<import("leaflet").LayerGroup | null>(null);
  const userMarker = useRef<import("leaflet").CircleMarker | null>(null);

  useEffect(() => {
    let active = true;
    void import("leaflet").then((L) => {
      if (!active || !mapContainer.current || mapRef.current) return;
      const map = L.map(mapContainer.current, { zoomControl: false, attributionControl: true })
        .setView([FRESNO_CENTER.latitude, FRESNO_CENTER.longitude], 13);
      L.control.zoom({ position: "topright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "© OpenStreetMap",
      }).addTo(map);
      markerLayer.current = L.layerGroup().addTo(map);
      map.on("moveend", () => {
        const center = map.getCenter();
        onMapCenter({ latitude: center.lat, longitude: center.lng });
      });
      mapRef.current = map;
    });
    return () => {
      active = false;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [onMapCenter]);

  useEffect(() => {
    void import("leaflet").then((L) => {
      if (!mapRef.current || !markerLayer.current) return;
      markerLayer.current.clearLayers();
      camps.forEach((camp) => {
        const marker = L.marker([camp.latitude, camp.longitude], {
          icon: L.divIcon({
            className: "camp-marker-shell",
            html: `<span class="camp-marker camp-marker--${camp.status}${selectedId === camp.id ? " is-selected" : ""}"><span></span></span>`,
            iconSize: [38, 44],
            iconAnchor: [19, 42],
          }),
          title: camp.label,
        });
        marker.on("click", () => onSelect(camp));
        marker.addTo(markerLayer.current!);
      });
    });
  }, [camps, onSelect, selectedId]);

  useEffect(() => {
    void import("leaflet").then((L) => {
      if (!mapRef.current || !userPosition) return;
      mapRef.current.setView([userPosition.latitude, userPosition.longitude], 15);
      if (userMarker.current) {
        userMarker.current.setLatLng([userPosition.latitude, userPosition.longitude]);
      } else {
        userMarker.current = L.circleMarker([userPosition.latitude, userPosition.longitude], {
          radius: 9, weight: 4, color: "#ffffff", fillColor: "#1269e8", fillOpacity: 1,
        }).addTo(mapRef.current);
      }
    });
  }, [userPosition]);

  return <div ref={mapContainer} className="h-full w-full" aria-label="Outreach camp map" />;
}

function LocationCard({ camp, userPosition, onSelect }: {
  camp: Camp;
  userPosition: Coordinates | null;
  onSelect: (camp: Camp) => void;
}) {
  const distance = userPosition ? distanceLabel(distanceMeters(userPosition, { latitude: camp.latitude, longitude: camp.longitude })) : null;
  return (
    <button type="button" onClick={() => onSelect(camp)} className="w-full rounded-2xl border border-[#d9e2df] bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#9bb6ae] hover:shadow-md focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#43c49a]/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-[#172b29]">{camp.label}</h3>
          <p className="mt-1 text-sm text-[#60706e]">{distance ? `${distance} · ` : ""}{timeLabel(camp.lastConfirmedAt)}</p>
        </div>
        <Badge className={statusStyles[camp.status]}>{statusCopy[camp.status]}</Badge>
      </div>
    </button>
  );
}

export function CampMapApp({ userName }: { userName: string }) {
  const [camps, setCamps] = useState<Camp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("open");
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [userPosition, setUserPosition] = useState<Coordinates | null>(null);
  const [mapCenter, setMapCenter] = useState<Coordinates>(FRESNO_CENTER);
  const [alertsActive, setAlertsActive] = useState(false);
  const [alertRadius, setAlertRadius] = useState("152");
  const [draft, setDraft] = useState({ label: "", notes: "", latitude: "", longitude: "" });
  const [confirmation, setConfirmation] = useState<{ verdict: Verdict; note: string }>({ verdict: "still_here", note: "" });

  const loadCamps = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/camps", { cache: "no-store" });
      const payload = (await response.json()) as { camps?: Camp[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Locations could not be loaded.");
      setCamps(payload.camps ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Locations could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCamps();
    if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js");
  }, [loadCamps]);

  const filteredCamps = useMemo(() => {
    const source = filter === "open" ? camps.filter((camp) => camp.status !== "inactive") : camps.filter((camp) => camp.status === filter);
    if (!userPosition) return source;
    return [...source].sort((first, second) =>
      distanceMeters(userPosition, { latitude: first.latitude, longitude: first.longitude }) -
      distanceMeters(userPosition, { latitude: second.latitude, longitude: second.longitude }));
  }, [camps, filter, userPosition]);

  const setCurrentPosition = useCallback((position: GeolocationPosition) => {
    const coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude };
    setUserPosition(coordinates);
    setMapCenter(coordinates);
  }, []);

  const locateMe = useCallback(() => {
    if (!navigator.geolocation) return toast.error("Location is not available on this device.");
    navigator.geolocation.getCurrentPosition(
      (position) => { setCurrentPosition(position); toast.success("Your location is ready."); },
      () => toast.error("Allow location access to use nearby alerts."),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    );
  }, [setCurrentPosition]);

  useEffect(() => {
    if (!alertsActive || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      setCurrentPosition,
      () => { setAlertsActive(false); toast.error("Nearby alerts stopped because location access is off."); },
      { enableHighAccuracy: true, maximumAge: 20_000, timeout: 20_000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [alertsActive, setCurrentPosition]);

  useEffect(() => {
    if (!alertsActive || !userPosition) return;
    const radius = Number(alertRadius);
    camps.filter((camp) => camp.status !== "inactive").forEach((camp) => {
      const meters = distanceMeters(userPosition, { latitude: camp.latitude, longitude: camp.longitude });
      if (meters > radius) return;
      const storageKey = `nearby-camp-alert-${camp.id}`;
      const lastAlert = Number(localStorage.getItem(storageKey) ?? 0);
      if (Date.now() - lastAlert < 3_600_000) return;
      localStorage.setItem(storageKey, String(Date.now()));
      const message = `${camp.label} is ${distanceLabel(meters)}. Confirm the current status.`;
      toast.info(message);
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Outreach location nearby", {
          body: message,
          tag: `camp-${camp.id}`,
        });
      }
    });
  }, [alertRadius, alertsActive, camps, userPosition]);

  const startAlerts = async () => {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") toast.success("Nearby notifications are on.");
      else toast.info("Nearby alerts will appear while the app is open.");
    }
    locateMe();
    setAlertsActive(true);
  };

  const openLog = () => {
    const coordinates = userPosition ?? mapCenter;
    setDraft({ label: "", notes: "", latitude: coordinates.latitude.toFixed(6), longitude: coordinates.longitude.toFixed(6) });
    setLogOpen(true);
  };

  const saveCamp = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/camps", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ label: draft.label, notes: draft.notes, latitude: Number(draft.latitude), longitude: Number(draft.longitude) }),
      });
      const payload = (await response.json()) as { camp?: Camp; error?: string };
      if (!response.ok || !payload.camp) throw new Error(payload.error ?? "Location could not be saved.");
      setCamps((current) => [payload.camp!, ...current]);
      setLogOpen(false);
      setSelectedCamp(payload.camp);
      toast.success("Outreach location logged.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Location could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const saveConfirmation = async () => {
    if (!selectedCamp) return;
    setSaving(true);
    try {
      const response = await fetch("/api/camps", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ campId: selectedCamp.id, ...confirmation }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Confirmation could not be saved.");
      await loadCamps();
      setConfirmOpen(false);
      setSelectedCamp(null);
      toast.success("Field confirmation saved.");
    } catch (saveError) {
      toast.error(saveError instanceof Error ? saveError.message : "Confirmation could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const activeCount = camps.filter((camp) => camp.status === "active").length;
  const checkCount = camps.filter((camp) => camp.status === "needs_check").length;

  const filterButtons = (
    <div className="flex gap-2 overflow-x-auto scrollbar-none">
      {FILTERS.map((value) => (
        <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)} className={filter === value ? "bg-[#0c3f38] text-white" : "bg-white"}>
          {value === "open" ? "Open" : statusCopy[value]}
        </Button>
      ))}
    </div>
  );

  return (
    <main className="flex h-dvh min-h-[640px] flex-col overflow-hidden bg-[#eef4f2] text-[#172b29]">
      <header className="z-30 flex h-[72px] shrink-0 items-center justify-between border-b border-[#d9e2df] bg-[#f8fbfa]/95 px-4 backdrop-blur md:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#0c3f38] text-white shadow-sm"><Navigation className="size-5" /></div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight md:text-xl">Outreach Camp Nearby</h1>
            <p className="truncate text-xs text-[#60706e]">Private field map · {userName}</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 md:flex">
          <Badge variant="outline" className="border-[#9bb6ae] bg-white text-[#31564f]"><ShieldCheck /> Protected locations</Badge>
          <Button variant="outline" size="sm" onClick={() => void loadCamps()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> Refresh</Button>
        </div>
      </header>

      <section className="relative grid min-h-0 flex-1 lg:grid-cols-[380px_1fr]">
        <aside className="hidden min-h-0 flex-col border-r border-[#d9e2df] bg-[#f8fbfa] lg:flex">
          <div className="border-b border-[#d9e2df] p-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[#dff7ef] p-4"><p className="text-2xl font-black text-[#096b4b]">{activeCount}</p><p className="text-sm font-medium text-[#31564f]">Confirmed active</p></div>
              <div className="rounded-2xl bg-[#fff1c9] p-4"><p className="text-2xl font-black text-[#895b00]">{checkCount}</p><p className="text-sm font-medium text-[#6a5120]">Need a check</p></div>
            </div>
            <div className="mt-4">{filterButtons}</div>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
            {loading && <p className="text-sm text-[#60706e]">Loading locations…</p>}
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            {!loading && !error && filteredCamps.length === 0 && <EmptyLocations />}
            {filteredCamps.map((camp) => <LocationCard key={camp.id} camp={camp} userPosition={userPosition} onSelect={setSelectedCamp} />)}
          </div>
          <div className="border-t border-[#d9e2df] p-4 text-xs leading-5 text-[#60706e]">Do not enter names, medical details, or identifying information about people at a location.</div>
        </aside>

        <div className="relative min-h-0 overflow-hidden">
          <MapSurface camps={filteredCamps} userPosition={userPosition} selectedId={selectedCamp?.id ?? null} onSelect={setSelectedCamp} onMapCenter={setMapCenter} />
          <div className="pointer-events-none absolute left-3 top-3 z-[500] flex max-w-[calc(100%-5.5rem)] items-center gap-2 md:left-5 md:top-5">
            <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/80 bg-[#f8fbfa]/95 px-3 py-2 shadow-lg backdrop-blur"><span className="size-2.5 rounded-full bg-[#0d9f6e]" /><span className="text-sm font-semibold">{activeCount} active</span></div>
            {checkCount > 0 && <div className="pointer-events-auto hidden items-center gap-2 rounded-full border border-white/80 bg-[#fff1c9]/95 px-3 py-2 shadow-lg backdrop-blur sm:flex"><TriangleAlert className="size-4 text-[#895b00]" /><span className="text-sm font-semibold">{checkCount} need checks</span></div>}
          </div>
          <div className="absolute right-3 top-20 z-[500] hidden rounded-xl border border-white/80 bg-[#f8fbfa]/95 p-2 shadow-lg backdrop-blur md:block">
            <Label htmlFor="radius" className="px-1 pb-2 text-xs text-[#60706e]">Alert distance</Label>
            <Select value={alertRadius} onValueChange={setAlertRadius}><SelectTrigger id="radius" className="w-32 bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="152">500 feet</SelectItem><SelectItem value="305">1,000 feet</SelectItem><SelectItem value="805">1/2 mile</SelectItem></SelectContent></Select>
          </div>
          <div className="absolute bottom-4 left-1/2 z-[500] flex w-[calc(100%-1.5rem)] max-w-[640px] -translate-x-1/2 items-center justify-between gap-1 rounded-2xl border border-white/80 bg-[#f8fbfa]/95 p-2 shadow-[0_18px_50px_rgba(10,45,39,0.22)] backdrop-blur md:bottom-6 md:p-3">
            <Button className="h-12 flex-1 bg-[#f25b3d] text-white hover:bg-[#da472b]" onClick={openLog}><Plus /> Log camp</Button>
            <Button variant="ghost" className="h-12 flex-1 lg:hidden" onClick={() => setListOpen(true)}><ListFilter /><span className="hidden min-[390px]:inline">Locations</span></Button>
            <Button variant="ghost" className="h-12 flex-1" onClick={locateMe}><LocateFixed /><span className="hidden min-[390px]:inline">Locate</span></Button>
            <Button variant={alertsActive ? "secondary" : "ghost"} className="h-12 flex-1" onClick={() => alertsActive ? setAlertsActive(false) : void startAlerts()}>{alertsActive ? <BellRing /> : <Bell />}<span className="hidden min-[390px]:inline">Alerts</span></Button>
          </div>
        </div>
      </section>

      <LogDialog open={logOpen} onOpenChange={setLogOpen} draft={draft} setDraft={setDraft} saving={saving} mapCenter={mapCenter} userPosition={userPosition} locateMe={locateMe} saveCamp={saveCamp} />
      <LocationsSheet open={listOpen} onOpenChange={setListOpen} filterButtons={filterButtons} camps={filteredCamps} userPosition={userPosition} loading={loading} onSelect={(camp) => { setSelectedCamp(camp); setListOpen(false); }} />
      <CampDetail camp={selectedCamp} userPosition={userPosition} onClose={() => setSelectedCamp(null)} onConfirm={() => setConfirmOpen(true)} />
      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} confirmation={confirmation} setConfirmation={setConfirmation} saving={saving} saveConfirmation={saveConfirmation} />
      <Toaster position="top-center" richColors />
    </main>
  );
}

function EmptyLocations() {
  return (
    <div className="rounded-2xl border border-dashed border-[#9bb6ae] bg-white p-6 text-center">
      <MapPin className="mx-auto size-7 text-[#45907e]" />
      <p className="mt-3 font-semibold">No locations in this view</p>
      <p className="mt-1 text-sm text-[#60706e]">Log the first field observation.</p>
    </div>
  );
}

function LogDialog({ open, onOpenChange, draft, setDraft, saving, mapCenter, userPosition, locateMe, saveCamp }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: { label: string; notes: string; latitude: string; longitude: string };
  setDraft: (draft: { label: string; notes: string; latitude: string; longitude: string }) => void;
  saving: boolean;
  mapCenter: Coordinates;
  userPosition: Coordinates | null;
  locateMe: () => void;
  saveCamp: () => Promise<void>;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto rounded-3xl border-[#d9e2df] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl"><MapPin className="text-[#f25b3d]" /> Log an outreach location</DialogTitle>
          <DialogDescription>Use your GPS location or the center of the map. Add landmarks, not personal information.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="label">Cross streets or landmark</Label>
            <Input id="label" value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Example: Canal trail east of Maple" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="notes">Outreach notes</Label>
            <Textarea id="notes" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder="Access point, visible shelter type, service needs — no names" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2"><Label htmlFor="latitude">Latitude</Label><Input id="latitude" inputMode="decimal" value={draft.latitude} onChange={(event) => setDraft({ ...draft, latitude: event.target.value })} /></div>
            <div className="grid gap-2"><Label htmlFor="longitude">Longitude</Label><Input id="longitude" inputMode="decimal" value={draft.longitude} onChange={(event) => setDraft({ ...draft, longitude: event.target.value })} /></div>
          </div>
          <Button type="button" variant="outline" onClick={() => {
            const coordinates = userPosition ?? mapCenter;
            setDraft({ ...draft, latitude: coordinates.latitude.toFixed(6), longitude: coordinates.longitude.toFixed(6) });
            if (!userPosition) locateMe();
          }}><Crosshair /> Use my current location</Button>
          <div className="rounded-xl bg-[#fff5df] p-3 text-sm leading-6 text-[#6a5120]"><ShieldCheck className="mr-2 inline size-4" />This private map is for coordinated outreach. Do not use it for enforcement or public posting.</div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="bg-[#0c3f38] text-white" onClick={() => void saveCamp()} disabled={saving || draft.label.trim().length < 2}>{saving ? "Saving…" : "Save location"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationsSheet({ open, onOpenChange, filterButtons, camps, userPosition, loading, onSelect }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterButtons: ReactNode;
  camps: Camp[];
  userPosition: Coordinates | null;
  loading: boolean;
  onSelect: (camp: Camp) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="w-[92%] bg-[#f8fbfa] sm:max-w-md">
        <SheetHeader className="border-b border-[#d9e2df] pt-6"><SheetTitle>Outreach locations</SheetTitle><SheetDescription>Nearest open locations appear first when GPS is on.</SheetDescription></SheetHeader>
        <div className="px-4">{filterButtons}</div>
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
          {camps.map((camp) => <LocationCard key={camp.id} camp={camp} userPosition={userPosition} onSelect={onSelect} />)}
          {!loading && camps.length === 0 && <EmptyLocations />}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CampDetail({ camp, userPosition, onClose, onConfirm }: {
  camp: Camp | null;
  userPosition: Coordinates | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Sheet open={Boolean(camp)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="bottom" className="max-h-[86dvh] rounded-t-3xl bg-[#f8fbfa] sm:inset-y-0 sm:right-0 sm:left-auto sm:h-full sm:w-[430px] sm:rounded-none sm:border-l">
        {camp && (
          <>
            <SheetHeader className="border-b border-[#d9e2df] pt-6">
              <div className="mb-2 flex items-center gap-2"><Badge className={statusStyles[camp.status]}>{statusCopy[camp.status]}</Badge>{userPosition && <span className="text-sm text-[#60706e]">{distanceLabel(distanceMeters(userPosition, { latitude: camp.latitude, longitude: camp.longitude }))}</span>}</div>
              <SheetTitle className="text-xl">{camp.label}</SheetTitle>
              <SheetDescription>{timeLabel(camp.lastConfirmedAt)} · {camp.confirmationCount} field {camp.confirmationCount === 1 ? "check" : "checks"}</SheetDescription>
            </SheetHeader>
            <div className="space-y-5 overflow-y-auto px-4 pb-8">
              {camp.notes && <div><p className="text-sm font-semibold text-[#31564f]">Outreach notes</p><p className="mt-2 rounded-2xl bg-white p-4 leading-7 text-[#314340] shadow-sm">{camp.notes}</p></div>}
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-[#60706e]">Latitude</p><p className="mt-1 font-mono font-semibold">{camp.latitude.toFixed(5)}</p></div>
                <div className="rounded-2xl bg-white p-4 shadow-sm"><p className="text-[#60706e]">Longitude</p><p className="mt-1 font-mono font-semibold">{camp.longitude.toFixed(5)}</p></div>
              </div>
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${camp.latitude},${camp.longitude}`} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center gap-2 rounded-xl border border-[#9bb6ae] bg-white font-semibold text-[#0c3f38] shadow-sm"><Navigation /> Open directions</a>
              <Button className="h-14 w-full bg-[#0c3f38] text-base text-white" onClick={onConfirm}><ClipboardCheck /> Confirm current status</Button>
              <p className="text-center text-xs leading-5 text-[#60706e]">Logged by {camp.createdBy}. Confirm only from a current field observation.</p>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function ConfirmDialog({ open, onOpenChange, confirmation, setConfirmation, saving, saveConfirmation }: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  confirmation: { verdict: Verdict; note: string };
  setConfirmation: (confirmation: { verdict: Verdict; note: string }) => void;
  saving: boolean;
  saveConfirmation: () => Promise<void>;
}) {
  const choices = [
    ["still_here", CheckCircle2, "Still there", "Camp or occupied site is currently visible."],
    ["not_there", XCircle, "No longer there", "The camp is no longer at this location."],
    ["needs_followup", TriangleAlert, "Needs follow-up", "The current status is unclear or access was limited."],
  ] as const;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl border-[#d9e2df] sm:max-w-lg">
        <DialogHeader><DialogTitle>What did you observe?</DialogTitle><DialogDescription>Your confirmation updates the shared outreach map immediately.</DialogDescription></DialogHeader>
        <div className="grid gap-3 py-2">
          {choices.map(([value, Icon, title, description]) => (
            <button key={value} type="button" onClick={() => setConfirmation({ ...confirmation, verdict: value })} className={`flex items-start gap-3 rounded-2xl border p-4 text-left transition ${confirmation.verdict === value ? "border-[#0c3f38] bg-[#e2f3ee] ring-2 ring-[#43c49a]/25" : "border-[#d9e2df] bg-white"}`}>
              <Icon className="mt-0.5 size-5 shrink-0" /><span><span className="block font-semibold">{title}</span><span className="mt-1 block text-sm leading-5 text-[#60706e]">{description}</span></span>
            </button>
          ))}
          <div className="grid gap-2 pt-2"><Label htmlFor="confirm-note">Optional field note</Label><Textarea id="confirm-note" value={confirmation.note} onChange={(event) => setConfirmation({ ...confirmation, note: event.target.value })} placeholder="Example: viewed from public right-of-way" /></div>
        </div>
        <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button className="bg-[#0c3f38] text-white" onClick={() => void saveConfirmation()} disabled={saving}>{saving ? "Saving…" : "Save confirmation"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
