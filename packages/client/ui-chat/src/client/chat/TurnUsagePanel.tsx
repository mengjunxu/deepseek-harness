/** Completed-Turn token usage action and its accounting details dialog. */

import { createPortal } from 'react-dom'
import { IconDatabaseOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { TurnTokenUsage } from '../contract/chat-nodes.ts'
import type { ChatViewSlotProps } from '../contract/slots.ts'
import type { LlmUsageSource } from '@deepseek-ai/dsh-llm/types'
import { formatCacheHitPercent, formatExactTokens, formatTokens } from './token-format.ts'
import { MEASURE_STYLE, useStatDialog } from './stat-dialog.ts'
import css from './TurnUsagePanel.module.css'
import dialogCss from './stat-dialog.module.css'

const sourceKeys = {
  work_codex_shared: 'message.turnUsage.source.workCodex',
  chatgpt_web_unofficial: 'message.turnUsage.source.web',
  api_metered: 'message.turnUsage.source.api',
  third_party: 'message.turnUsage.source.thirdParty',
  local: 'message.turnUsage.source.local',
  experimental_unverified: 'message.turnUsage.source.experimental',
  unknown: 'message.turnUsage.source.unknown',
} as const satisfies Record<LlmUsageSource, string>

const measurementKeys = {
  'provider-reported': 'message.turnUsage.measurement.reported',
  estimated: 'message.turnUsage.measurement.estimated',
  mixed: 'message.turnUsage.measurement.mixed',
  unknown: 'message.turnUsage.measurement.unknown',
} as const satisfies Record<NonNullable<TurnTokenUsage['measurement']> | 'unknown', string>

export interface TurnUsagePanelProps {
  usage: TurnTokenUsage
  /** The owning view's locale seat, passed down as a plain prop. */
  t: ChatViewSlotProps['t']
}

function formatCompactCount(value: number, t: ChatViewSlotProps['t']): string {
  return t('message.turnUsage.count', { count: formatTokens(value, t) })
}

function formatExactCount(value: number, t: ChatViewSlotProps['t']): string {
  return t('message.turnUsage.count', { count: formatExactTokens(value, t) })
}

/**
 * Turn-usage IconActions pill with a click-open Turn-usage details dialog.
 * @param props - Turn usage buckets and locale seat.
 * @returns The trigger and, while open, its portaled dialog anchored above the trigger.
 */
export function TurnUsagePanel({ usage, t }: TurnUsagePanelProps) {
  const { open, setOpen, rootRef, panelRef, pos } = useStatDialog()

  const cacheHit = usage.cacheReadTokens === undefined
    ? null
    : formatCacheHitPercent(usage.cacheReadTokens, usage.totalTokens - usage.outputTokens, 1)
  const total = formatCompactCount(usage.totalTokens, t)
  const label = t('message.turnUsage.consumed', { total })
  const routes = [...new Set(usage.routes?.map(route => `${route.provider}/${route.model}`))].join(', ')

  return (
    <span ref={rootRef} className={css.root}>
      <button
        type="button"
        className={css.trigger}
        aria-label={label}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open) }}
      >
        <IconDatabaseOutlineRegular />
        <span className={css.label}>{label}</span>
      </button>
      {open && createPortal(
        <div
          ref={panelRef}
          className={dialogCss.panel}
          role="dialog"
          aria-label={t('message.turnUsage.title')}
          style={pos ?? MEASURE_STYLE}
        >
          <div className={dialogCss.title}>
            <span className={dialogCss.titleLabel}>
              <IconDatabaseOutlineRegular />
              {t('message.turnUsage.title')}
            </span>
            <span className={dialogCss.titleValue}>{formatExactCount(usage.totalTokens, t)}</span>
          </div>
          <div className={dialogCss.titleRule} aria-hidden />
          <dl className={dialogCss.details} data-turn-usage-details>
            {routes !== '' && (
              <>
                <dt>{t('message.turnUsage.model')}</dt>
                <dd className={dialogCss.route}>{routes}</dd>
              </>
            )}
            <dt>{t('message.turnUsage.source')}</dt>
            <dd className={dialogCss.route} data-turn-usage-source>
              {usage.routes?.length ? usage.routes.map(route => (
                <div key={`${route.provider}\0${route.model}\0${route.usageSource}`}>
                  {t('message.turnUsage.sourceRoute', {
                    source: t(sourceKeys[route.usageSource]), route: `${route.provider}/${route.model}`,
                  })}
                </div>
              )) : t(sourceKeys.unknown)}
            </dd>
            <dt>{t('message.turnUsage.measurement')}</dt>
            <dd data-turn-usage-measurement>{t(measurementKeys[usage.measurement ?? 'unknown'])}</dd>
            {cacheHit !== null && (
              <>
                <dt>{t('message.turnUsage.cacheHit')}</dt>
                <dd>{`${cacheHit}%`}</dd>
              </>
            )}
            <dt>{t('message.turnUsage.input')}</dt>
            <dd>{formatExactCount(usage.uncachedInputTokens, t)}</dd>
            {usage.cacheReadTokens !== undefined && (
              <>
                <dt>{t('message.turnUsage.cacheRead')}</dt>
                <dd>{formatExactCount(usage.cacheReadTokens, t)}</dd>
              </>
            )}
            {usage.cacheWriteTokens !== undefined && (
              <>
                <dt>{t('message.turnUsage.cacheWrite')}</dt>
                <dd>{formatExactCount(usage.cacheWriteTokens, t)}</dd>
              </>
            )}
            <dt>{t('message.turnUsage.output')}</dt>
            <dd>
              {formatExactCount(usage.outputTokens, t)}
              {usage.reasoningTokens !== undefined && (
                <span className={dialogCss.reasoning}>
                  {t('message.turnUsage.reasoning', { tokens: formatExactCount(usage.reasoningTokens, t) })}
                </span>
              )}
            </dd>
          </dl>
        </div>,
        document.body,
      )}
    </span>
  )
}
