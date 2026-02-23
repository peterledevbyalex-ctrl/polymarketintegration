"use client"

import { MegaVaultPositionWidget } from '@avon_xyz/widget'
import { useConnectModal } from '@rainbow-me/rainbowkit'

import { BackgroundMask } from '@/components/BackgroundMask'
import { MegaLogo } from '@/components/icons/MegaLogo'

const chainId = 42161
const appName = 'Prism DEX'

const themeColors = {
    background: 'hsl(var(--color-background))',
    border: 'hsl(var(--color-border))',
    textPrimary: 'hsl(var(--color-foreground))',
    textSecondary: 'hsl(var(--color-foreground-light))',
    accent: 'hsl(var(--color-background-light))',
    accentSecondary: 'hsl(var(--color-tertiary))',
    tagBackground: 'hsl(var(--color-background-light))',
    tabListBackground: 'hsl(var(--color-background-light-sm))',
    inputCardBackground: 'hsl(var(--color-background-light))',
    secondaryCardBackground: 'hsl(var(--color-background-light))',
    actionButtonBackground: 'hsl(var(--color-background-btn))',
    actionButtonText: 'hsl(var(--color-primary-foreground))',
    secondaryButtonBackground: 'hsl(var(--color-background))',
    secondaryButtonText: 'hsl(var(--color-foreground))',
    sliderTrackBackground: 'hsl(var(--color-background-light))',
    sliderThumbBackground: 'hsl(var(--color-foreground))',
    sliderTooltipBackground: 'hsl(var(--color-foreground))',
    sliderTooltipText: 'hsl(var(--color-background))',
    success: 'hsl(var(--color-success))',
    error: 'hsl(var(--color-tertiary))',
    pending: 'hsl(var(--color-foreground))',
}

const envReferrerAddress = process.env.NEXT_PUBLIC_AVON_REFERRER_ADDRESS
const referrerAddress = envReferrerAddress?.startsWith('0x')
    ? (envReferrerAddress as `0x${string}`)
    : undefined

export function EarnPageContent() {
    const { openConnectModal } = useConnectModal()

    return (
        <>
            <div className="fixed inset-0 gradient-bg" />
            <BackgroundMask />

            <div className="flex-1 flex items-center justify-center">
                <div className="z-10 mb-20 w-full max-w-md px-4">
                    <div className="text-center">
                        <h1 className="text-2xl font-bold text-foreground font-sans my-4">
                            Earn with MegaVaults.
                        </h1>
                        <div className="text-md text-foreground font-body mb-12">
                            <div className="flex items-center justify-center gap-2">
                                Powered by
                                <MegaLogo />
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl bg-background-light p-1">
                        <MegaVaultPositionWidget
                            chainId={chainId}
                            {...(referrerAddress ? { referrerAddress } : {})}
                            appName={appName}
                            widgetBackground={themeColors.background}
                            borderColor={themeColors.border}
                            textPrimary={themeColors.textPrimary}
                            textSecondary={themeColors.textSecondary}
                            accent={themeColors.accent}
                            accentSecondary={themeColors.accentSecondary}
                            tagBackground={themeColors.tagBackground}
                            tabActiveBackground={themeColors.accent}
                            tabActiveText={themeColors.textPrimary}
                            tabInactiveBackground="transparent"
                            tabInactiveText={themeColors.textSecondary}
                            tabListBackground={themeColors.tabListBackground}
                            inputCardBackground={themeColors.inputCardBackground}
                            secondaryCardBackground={themeColors.secondaryCardBackground}
                            secondaryCardHeading={themeColors.textPrimary}
                            secondaryCardSubheading={themeColors.textSecondary}
                            actionButtonBackground={themeColors.actionButtonBackground}
                            actionButtonText={themeColors.actionButtonText}
                            secondaryButtonBackground={themeColors.secondaryButtonBackground}
                            secondaryButtonText={themeColors.secondaryButtonText}
                            sliderTrackBackground={themeColors.sliderTrackBackground}
                            sliderThumbBackground={themeColors.sliderThumbBackground}
                            sliderTooltipBackground={themeColors.sliderTooltipBackground}
                            sliderTooltipText={themeColors.sliderTooltipText}
                            success={themeColors.success}
                            error={themeColors.error}
                            pending={themeColors.pending}
                            primaryFontClass=""
                            secondaryFontClass="font-supply-mono"
                            borderRadius="12px"
                            onConnectWallet={() => openConnectModal?.()}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}
