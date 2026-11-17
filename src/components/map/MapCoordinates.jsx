
import { useEffect, useState } from "react";
import { useMap } from "react-leaflet";

export default function MapCoordinates() {
  const map = useMap();
  const [position, setPosition] = useState(null);

  useEffect(() => {
    function handleMove(event) {
      setPosition(event.latlng);
    }

    function handleOut() {
      setPosition(null);
    }

    map.on("mousemove", handleMove);
    map.on("mouseout", handleOut);

    return () => {
      map.off("mousemove", handleMove);
      map.off("mouseout", handleOut);
    };
  }, [map]);

  return (
    <div className="firelens-coordinates">
      {position ? (
        <>
          <span>
            Lat: {position.lat.toFixed(5)}°
          </span>
          <span>
            Lon: {position.lng.toFixed(5)}°
          </span>
        </>
      ) : (
        <span>Move cursor over map</span>
      )}
    </div>
  );
}
