'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';

const AUTH_MESSAGES: Record<string, { message: string; href: string; action: string }> = {
  access_denied: {
    message: 'Discord sign-in was cancelled. You can try again whenever you’re ready.',
    href: '/api/auth/login?returnTo=/dashboard',
    action: 'Log in with Discord',
  },
  login_failed: {
    message: 'Discord sign-in could not be completed. Please try again.',
    href: '/api/auth/login?returnTo=/dashboard',
    action: 'Try signing in again',
  },
  bot_invite_cancelled: {
    message: 'The bot invite was cancelled. DexBotX was not added to a server.',
    href: '/api/invite',
    action: 'Try the invite again',
  },
  bot_invite_failed: {
    message: 'The bot invite could not be completed. Please try again.',
    href: '/api/invite',
    action: 'Try the invite again',
  },
};

export function HomeAuthBanner() {
  const searchParams = useSearchParams();
  const errorCode = searchParams.get('error') ?? '';
  const authMessage = AUTH_MESSAGES[errorCode];
  const inviteNotice = searchParams.get('notice') === 'bot_added_login_required';
  if (!authMessage && !inviteNotice) return null;

  return (
    <DismissibleAuthBanner
      key={errorCode || 'bot_added_login_required'}
      message={authMessage?.message ??
        'DexBotX was authorized for your server. Log in with Discord to configure it in the dashboard.'}
      href={authMessage?.href ?? '/api/auth/login?returnTo=/dashboard'}
      action={authMessage?.action ?? 'Log in with Discord'}
      role={authMessage ? 'alert' : 'status'}
    />
  );
}

function DismissibleAuthBanner({
  message,
  href,
  action,
  role,
}: {
  message: string;
  href: string;
  action: string;
  role: 'alert' | 'status';
}) {
  const [visible, setVisible] = useState(true);
  const bannerRef = useRef<HTMLDivElement>(null);
  const timerExpired = useRef(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (bannerRef.current?.contains(document.activeElement)) {
        timerExpired.current = true;
      } else {
        setVisible(false);
      }
    }, 5000);

    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div
      ref={bannerRef}
      role={role}
      onBlur={(event) => {
        const nextTarget = event.relatedTarget;
        const focusRemainsInBanner = nextTarget instanceof Node && event.currentTarget.contains(nextTarget);
        if (timerExpired.current && !focusRemainsInBanner) setVisible(false);
      }}
      className="mx-auto mt-6 flex max-w-4xl flex-wrap items-center justify-between gap-3 rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-sm text-white/85"
    >
      <p>{message}</p>
      <a
        href={href}
        className="shrink-0 font-medium text-white underline underline-offset-4 hover:text-white/75"
      >
        {action}
      </a>
    </div>
  );
}
