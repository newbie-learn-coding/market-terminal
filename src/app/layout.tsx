import type { Metadata } from 'next';
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

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://trendanalysis.ai'),
  title: {
    default: 'TrendAnalysis.ai',
    template: '%s | TrendAnalysis.ai',
  },
  description: 'AI-powered trend analysis with real-time evidence maps and knowledge graphs.',
  openGraph: {
    siteName: 'TrendAnalysis.ai',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
