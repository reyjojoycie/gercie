// lib/utils/parseUserAgent.ts
export interface ParsedUA {
  browser: string
  os: string
  device: string
}

export function parseUserAgent(ua: string): ParsedUA {
  const browser = /Chrome|Firefox|Safari|Edge|Opera/i.exec(ua)?.[0] || 'Inconnu'
  const os = /Windows|Mac|Linux|Android|iOS/i.exec(ua)?.[0] || 'Inconnu'
  const device = /Mobile|Tablet/i.test(ua) ? 'Mobile' : 'Desktop'
  return { browser, os, device }
}

export function getDeviceLabel(ua: ParsedUA): string {
  return `${ua.browser} sur ${ua.os} (${ua.device})`
}