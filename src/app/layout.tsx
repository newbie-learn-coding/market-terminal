import { getLocale } from 'next-intl/server';
import { JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import Script from 'next/script';

import './globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-sans',
  weight: ['400', '500', '600', '700'],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '500', '600'],
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();

  return (
    <html lang={locale}>
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-SDGRVMER2G" strategy="afterInteractive" />
        <Script id="gtag-ga4" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'G-SDGRVMER2G');
        `}</Script>
        <Script src="https://www.googletagmanager.com/gtag/js?id=AW-879571748" strategy="afterInteractive" />
        <Script id="gtag-ads" strategy="afterInteractive">{`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', 'AW-879571748');
        `}</Script>
      </head>
      <body suppressHydrationWarning className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
