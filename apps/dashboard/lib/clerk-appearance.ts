import type { ComponentProps } from 'react';
import type { SignIn } from '@clerk/nextjs';

type Appearance = NonNullable<ComponentProps<typeof SignIn>['appearance']>;

/**
 * Clerk components on the light marketing surface (WEBSITE.md §6.1): violet
 * primary, Geist, card radius, pill buttons. AuthFrame carries the page title,
 * so Clerk's own header is hidden rather than duplicated.
 */
export const marketingAppearance: Appearance = {
  variables: {
    colorPrimary: '#7c3aed',
    colorBackground: '#ffffff',
    colorNeutral: '#0b1220',
    colorDanger: '#b91c1c',
    colorSuccess: '#15803d',
    colorWarning: '#a16207',
    borderRadius: '6px',
    fontFamily: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    fontFamilyButtons: 'var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif',
    fontWeight: { normal: 400, medium: 450, semibold: 500, bold: 500 },
    fontSize: '14px',
    colorForeground: '#0b1220',
    colorMutedForeground: 'rgba(11, 18, 32, 0.64)',
    colorInput: '#ffffff',
    colorInputForeground: '#0b1220',
    spacing: '1rem',
  },
  options: {
    socialButtonsVariant: 'blockButton',
    socialButtonsPlacement: 'top',
  },
  elements: {
    rootBox: 'w-full max-w-[400px]',
    cardBox: 'w-full shadow-card rounded-panel',
    card: 'rounded-panel bg-white',
    headerTitle: 'hidden',
    headerSubtitle: 'hidden',
    header: 'hidden',
    socialButtonsBlockButton: 'rounded-pill border border-[#e6e6e6] bg-white text-[#0b1220] shadow-none hover:bg-[#0b1220]/[0.039] transition-colors duration-200',
    socialButtonsBlockButtonText: 'font-medium',
    dividerLine: 'bg-[#e8e8e8]',
    dividerText: 'font-mono text-[12px] tracking-wide text-[#0b1220]/50',
    formFieldLabel: 'text-[13px] font-medium text-[#0b1220]',
    formFieldInput: 'rounded-card border-[#e6e6e6] focus:ring-2 focus:ring-[#7c3aed]/30 focus:border-[#7c3aed]',
    formButtonPrimary: 'rounded-pill bg-[#7c3aed] text-white font-medium shadow-btn hover:bg-[#7c3aed] hover:shadow-btn-hover transition-shadow duration-200 !text-[14px] normal-case',
    footer: 'bg-[#f9f9f9] border-t border-[#ededed]',
    footerActionText: 'text-[#0b1220]/64',
    footerActionLink: 'text-[#7c3aed] hover:text-[#6d28d9] font-medium',
    identityPreviewEditButton: 'text-[#7c3aed]',
    formResendCodeLink: 'text-[#7c3aed]',
    otpCodeFieldInput: 'rounded-card border-[#e6e6e6]',
  },
};
