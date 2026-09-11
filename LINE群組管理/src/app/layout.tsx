import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "LINE 門市營運系統 | 預約・叫號・點餐・LINE Pay",
  description: "全方位門市服務 LINE 官方帳號整合系統",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-TW">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body>{children}</body>
    </html>
  );
}
