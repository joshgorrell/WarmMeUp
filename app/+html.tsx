import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        {/* Pin viewport to device width; prevent browser zoom on input focus */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: webStyles }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

const webStyles = `
  /* Prevent mobile browsers from auto-inflating small text in landscape */
  html {
    -webkit-text-size-adjust: 100%;
    text-size-adjust: 100%;
  }

  /* Use Inter as the base font stack so fallback text before font load matches */
  body {
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* Remove default margins/padding that don't exist on native */
  body, #root {
    margin: 0;
    padding: 0;
  }
`;
