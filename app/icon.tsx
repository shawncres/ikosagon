import { ImageResponse } from "next/og";

export const size = {
  width: 64,
  height: 64,
};

export const contentType = "image/png";

export default function Icon() {
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
        }}
      >
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "999px",
            border: "4px solid #2BFFE8",
            boxShadow: "0 0 20px rgba(43,255,232,0.8)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
