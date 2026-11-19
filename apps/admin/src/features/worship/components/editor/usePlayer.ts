import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tocador do áudio-guia. O relógio da música é o `currentTime` deste áudio:
 * os tempos dos slides são marcados e conferidos contra ele.
 */
export function usePlayer(url: string | null) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [ended, setEnded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setPlaying(false);
    setTime(0);
    setDuration(null);
    setEnded(false);
    setFailed(false);
    if (!url) {
      audioRef.current = null;
      return;
    }
    const audio = new Audio();
    audio.preload = "auto";
    audio.src = url;
    audioRef.current = audio;
    const onMeta = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : null);
    const onPlay = () => {
      setPlaying(true);
      setEnded(false);
    };
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setEnded(true);
    };
    const onTime = () => setTime(audio.currentTime);
    const onError = () => setFailed(true);
    audio.addEventListener("loadedmetadata", onMeta);
    audio.addEventListener("durationchange", onMeta);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("seeked", onTime);
    audio.addEventListener("error", onError);
    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onMeta);
      audio.removeEventListener("durationchange", onMeta);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("seeked", onTime);
      audio.removeEventListener("error", onError);
      audio.removeAttribute("src");
      audio.load();
    };
  }, [url]);

  // `timeupdate` chega umas 4 vezes por segundo; a letra precisa trocar na hora.
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      if (audioRef.current) setTime(audioRef.current.currentTime);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const toggle = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play().catch(() => setFailed(true));
    else audio.pause();
  }, []);

  const seek = useCallback((to: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    const max = Number.isFinite(audio.duration) ? audio.duration : to;
    audio.currentTime = Math.max(0, Math.min(to, max));
    setTime(audio.currentTime);
  }, []);

  /** O tempo exato deste instante (o estado `time` pode estar um quadro atrás). */
  const now = useCallback(() => audioRef.current?.currentTime ?? 0, []);

  return { playing, time, duration, ended, failed, toggle, seek, now };
}
