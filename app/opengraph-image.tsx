import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#000",
          color: "#FAFAFA",
          fontSize: 88,
          fontWeight: 700,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            width: 220,
            height: 220,
            borderRadius: "999px",
            border: "8px solid #2BFFE8",
            boxShadow: "0 0 60px rgba(43,255,232,0.7)",
            transform: "translateX(-270px)",
          }}
        />
        IKOSAGON
      </div>
    ),
    { ...size },
  );
}
