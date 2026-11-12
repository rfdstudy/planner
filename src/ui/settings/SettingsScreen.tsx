import { useState } from 'react'
import {
  DRAG_STEP_OPTIONS,
  TASK_DURATION_OPTIONS,
  WEEKDAY_OPTIONS,
  type Preferences
} from '../../core/preferences'
import { formatDurationMinutes } from '../../core/time'
import type { JsonValue } from '../../core/types'
import { BackupFormatError, importBackup, parseBackup, type PlannerBackup } from '../../db/backup'
import { savePreference } from '../../db/preferences'
import { repositories } from '../../db/repositories'
import { platform } from '../../platform'
import { usePreferencesStore } from '../../state/preferences'
import { useUiStore } from '../../state/ui'
import { exportBackup } from '../exportBackup'
import { exportCalendarIcs } from '../exportCalendar'
import styles from './SettingsScreen.module.css'

type BusyAction = 'export' | 'import' | 'confirm' | 'ics' | 'preference'

interface PendingImport {
  backup: PlannerBackup
  fileName: string
}

const BACKUP_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short'
})

function formatBackupDate(value: string): string {
  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return value

  return BACKUP_DATE_FORMAT.format(date)
}

function describeBackup(backup: PlannerBackup): string {
  const { categories, itemTypes, items, blocks, templates, settings } = backup.data

  return [
    `${categories.length} catégorie${categories.length > 1 ? 's' : ''}`,
    `${itemTypes.length} type${itemTypes.length > 1 ? 's' : ''}`,
    `${items.length} élément${items.length > 1 ? 's' : ''}`,
    `${blocks.length} bloc${blocks.length > 1 ? 's' : ''}`,
    `${templates.length} modèle${templates.length > 1 ? 's' : ''}`,
    `${settings.length} réglage${settings.length > 1 ? 's' : ''}`
  ].join(' · ')
}

/**
 * Réglages minimaux et sauvegardes. Toutes les écritures passent par les
 * repositories ; l'import demande une confirmation explicite avant de vider
 * les tables existantes.
 */
export function SettingsScreen(): React.JSX.Element {
  const preferences = usePreferencesStore((state) => state.preferences)
  const setPreference = usePreferencesStore((state) => state.setPreference)
  const setWeekStartsOn = useUiStore((state) => state.setWeekStartsOn)
  const [busy, setBusy] = useState<BusyAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pendingImport, setPendingImport] = useState<PendingImport | null>(null)

  async function updatePreference<Key extends keyof Preferences>(
    key: Key,
    value: Preferences[Key]
  ): Promise<void> {
    if (busy !== null) return

    const previous = preferences[key]
    setBusy('preference')
    setError(null)
    setNotice(null)
    setPreference(key, value)

    if (key === 'weekStartsOn') {
      setWeekStartsOn(Number(value))
    }

    try {
      await savePreference(repositories, key, value as JsonValue)
      setNotice('Réglages enregistrés.')
    } catch {
      setPreference(key, previous)

      if (key === 'weekStartsOn') {
        setWeekStartsOn(Number(previous))
      }

      setError('Le réglage n’a pas pu être enregistré.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExportBackup(): Promise<void> {
    if (busy !== null) return

    setBusy('export')
    setError(null)
    setNotice(null)

    try {
      const saved = await exportBackup()
      setNotice(saved ? 'Sauvegarde JSON enregistrée.' : 'Export annulé.')
    } catch {
      setError('La sauvegarde n’a pas pu être enregistrée.')
    } finally {
      setBusy(null)
    }
  }

  async function handleExportCalendar(): Promise<void> {
    if (busy !== null) return

    setBusy('ics')
    setError(null)
    setNotice(null)

    try {
      const saved = await exportCalendarIcs()
      setNotice(saved ? 'Calendrier ICS enregistré.' : 'Export annulé.')
    } catch {
      setError('Le calendrier n’a pas pu être exporté.')
    } finally {
      setBusy(null)
    }
  }

  async function handleChooseImport(): Promise<void> {
    if (busy !== null) return

    setBusy('import')
    setError(null)
    setNotice(null)

    try {
      const file = await platform.openTextFile({
        filters: [{ name: 'Sauvegarde Planner', extensions: ['json'] }]
      })

      if (file === null) return

      const backup = parseBackup(file.content)
      setPendingImport({ backup, fileName: file.fileName })
    } catch (caught) {
      setError(
        caught instanceof BackupFormatError
          ? caught.message
          : 'Le fichier de sauvegarde n’a pas pu être lu.'
      )
    } finally {
      setBusy(null)
    }
  }

  async function handleConfirmImport(): Promise<void> {
    if (pendingImport === null || busy !== null) return

    setBusy('confirm')
    setError(null)

    try {
      await importBackup(repositories, pendingImport.backup)
      setPendingImport(null)
      setBusy(null)
      setNotice('Sauvegarde importée. Rechargement de Planner…')
      window.setTimeout(() => window.location.reload(), 600)
    } catch {
      setError('La sauvegarde n’a pas pu être importée. Vos données actuelles sont intactes.')
      setBusy(null)
    }
  }

  return (
    <div className={styles.screen}>
      <div className={styles.container}>
        <header className={styles.pageHeader}>
          <h1 className={styles.title}>Réglages</h1>
          <p className={styles.subtitle}>
            Ajustez le calendrier et gardez une copie de vos données.
          </p>
        </header>

        {error !== null && (
          <p className={styles.banner} role="alert">
            {error}
          </p>
        )}

        {notice !== null && (
          <p className={styles.notice} role="status">
            {notice}
          </p>
        )}

        <section className={styles.card} aria-labelledby="settings-calendar-title">
          <h2 className={styles.sectionTitle} id="settings-calendar-title">
            Calendrier
          </h2>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <label className={styles.label} htmlFor="setting-week-start">
                Premier jour de la semaine
              </label>
              <p className={styles.hint}>
                Choisissez le jour qui ouvre les colonnes de la semaine.
              </p>
            </div>
            <select
              id="setting-week-start"
              className={styles.select}
              value={preferences.weekStartsOn}
              disabled={busy !== null}
              onChange={(event) =>
                void updatePreference('weekStartsOn', Number(event.target.value))
              }
            >
              {WEEKDAY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <label className={styles.label} htmlFor="setting-task-duration">
                Durée par défaut des tâches
              </label>
              <p className={styles.hint}>Durée proposée quand une tâche n’a pas de temps estimé.</p>
            </div>
            <select
              id="setting-task-duration"
              className={styles.select}
              value={preferences.defaultTaskDurationMin}
              disabled={busy !== null}
              onChange={(event) =>
                void updatePreference('defaultTaskDurationMin', Number(event.target.value))
              }
            >
              {TASK_DURATION_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {formatDurationMinutes(minutes)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.settingRow}>
            <div className={styles.settingLabel}>
              <label className={styles.label} htmlFor="setting-drag-step">
                Pas de glisser
              </label>
              <p className={styles.hint}>Intervalle d’accrochage des blocs dans la grille.</p>
            </div>
            <select
              id="setting-drag-step"
              className={styles.select}
              value={preferences.dragStepMin}
              disabled={busy !== null}
              onChange={(event) => void updatePreference('dragStepMin', Number(event.target.value))}
            >
              {DRAG_STEP_OPTIONS.map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="settings-backup-title">
          <h2 className={styles.sectionTitle} id="settings-backup-title">
            Sauvegarde
          </h2>
          <p className={styles.sectionLead}>
            Une sauvegarde JSON contient toutes les catégories, tâches, blocs et réglages. Un import
            remplace l’intégralité des données actuelles.
          </p>

          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primaryButton}
              disabled={busy !== null}
              onClick={() => void handleExportBackup()}
            >
              {busy === 'export' ? 'Export…' : 'Exporter la sauvegarde (JSON)'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy !== null}
              onClick={() => void handleChooseImport()}
            >
              {busy === 'import' ? 'Lecture du fichier…' : 'Importer une sauvegarde…'}
            </button>
            <button
              type="button"
              className={styles.secondaryButton}
              disabled={busy !== null}
              onClick={() => void handleExportCalendar()}
            >
              {busy === 'ics' ? 'Export…' : 'Exporter le calendrier (ICS)'}
            </button>
          </div>

          <p className={styles.autoBackup}>
            {platform.kind === 'electron'
              ? 'Sauvegarde automatique active : les cinq dernières copies sont conservées dans le dossier de données de l’application.'
              : 'Sauvegarde automatique disponible dans l’application Electron.'}
          </p>

          {pendingImport !== null && (
            <div className={styles.confirmPanel} role="alertdialog" aria-modal="false">
              <h3 className={styles.confirmTitle}>Remplacer toutes les données ?</h3>
              <p className={styles.confirmText}>
                « {pendingImport.fileName} » · sauvegarde du{' '}
                {formatBackupDate(pendingImport.backup.exportedAt)}.
              </p>
              <p className={styles.confirmText}>{describeBackup(pendingImport.backup)}</p>
              <p className={styles.confirmWarning}>
                Cette opération est irréversible : les données actuelles seront remplacées.
              </p>
              <div className={styles.confirmActions}>
                <button
                  type="button"
                  className={styles.ghostButton}
                  disabled={busy !== null}
                  onClick={() => setPendingImport(null)}
                >
                  Annuler
                </button>
                <button
                  type="button"
                  className={styles.primaryButton}
                  disabled={busy !== null}
                  onClick={() => void handleConfirmImport()}
                >
                  {busy === 'confirm' ? 'Import…' : 'Remplacer les données'}
                </button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
