import { useEffect, useState } from "react";
import api from "../services/api";
import { getSocket } from "../services/socket";

export default function useAuctionLive(auctionId) {
  const [live, setLive] = useState(null);
  const [players, setPlayers] = useState([]);
  const [flash, setFlash] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!auctionId) return undefined;
    let active = true;
    let socket = null;

    const refreshPlayers = () => {
      api.get(`/api/auction/${auctionId}/players`).then((res) => {
        if (active) setPlayers(res.data || []);
      });
    };

    const applyLive = (data) => {
      if (!data) return;
      if (data?.id && Number(data.id) !== Number(auctionId)) return;
      setLive(data);
      setError("");
      if (data.lastSold) {
        setFlash({
          type: "sold",
          name: data.lastSold.playerName,
          price: data.lastSold.soldPrice,
          team: data.lastSold.teamName,
        });
      } else if (data.lastUnsold) {
        setFlash({ type: "unsold", name: data.lastUnsold.playerName });
      } else if (data.currentPlayer) {
        setFlash(null);
      }
      refreshPlayers();
    };

    Promise.all([
      api.get(`/api/auction/${auctionId}/state`),
      api.get(`/api/auction/${auctionId}/players`).catch(() => ({ data: [] })),
    ])
      .then(([stateRes, playersRes]) => {
        if (!active) return;
        setLive(stateRes.data);
        setPlayers(playersRes.data || []);
      })
      .catch(() => {
        if (active) setError("Could not load auction state");
      });

    const onLive = (data) => applyLive(data);
    const onError = (data) => setError(data?.message || "Action failed");

    try {
      socket = getSocket();
      socket.emit("auction:join", { auctionId: Number(auctionId) });
      socket.on("auction:live", onLive);
      socket.on("player:update", onLive);
      socket.on("player:sold", onLive);
      socket.on("player:unsold", onLive);
      socket.on("error", onError);
    } catch {
      // sockets optional
    }

    const poll = setInterval(() => {
      api
        .get(`/api/auction/${auctionId}/state`)
        .then((res) => {
          if (active) setLive(res.data);
        })
        .catch(() => {});
    }, 2500);

    return () => {
      active = false;
      clearInterval(poll);
      if (socket) {
        socket.off("auction:live", onLive);
        socket.off("player:update", onLive);
        socket.off("player:sold", onLive);
        socket.off("player:unsold", onLive);
        socket.off("error", onError);
      }
    };
  }, [auctionId]);

  return { live, setLive, players, setPlayers, flash, setFlash, error, setError };
}
