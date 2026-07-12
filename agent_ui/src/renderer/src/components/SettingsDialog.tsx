import { parse, stringify } from 'ini'
import { Loader2Icon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { createSession, deleteSession, getSession, updateState } from '@/lib/adk-client'

interface SettingsDialogProps {
  open: boolean;
  setOpen: (value: boolean) => void;
  onNoConfig?: boolean;
}

type Provider = 'ollama' | 'gemini' | ''

const DEFAULT_GEMINI_VARIANT = 'gemini-flash-latest'

// "user:" state keys persist user-wide, but the ADK endpoints for reading and
// writing state are session-scoped — so run each operation through a
// throwaway session.
async function withTempSession<T>(fn: (sessionId: string) => Promise<T>): Promise<T> {
  const id = (await createSession()).id
  try {
    return await fn(id)
  } finally {
    await deleteSession(id).catch(() => {})
  }
}

async function loadToken(): Promise<string> {
  try {
    return await withTempSession(async (id) => {
      const token = (await getSession(id)).state['user:DIGIICAMPUS_TOKEN']
      return typeof token === 'string' ? token : ''
    })
  } catch {
    return ''
  }
}

async function saveToken(token: string): Promise<void> {
  await withTempSession((id) => updateState(id, { 'user:DIGIICAMPUS_TOKEN': token }))
}

interface ModelConfig {
  provider: Provider
  modelName: string
  apiKey: string
  geminiVariant: string
}

async function loadModelConfig(): Promise<ModelConfig> {
  try {
    const cfg = parse(await window.api.readConfig())
    const model = (cfg.model ?? {}) as Record<string, string>
    const provider: Provider = model.model === 'ollama' || model.model === 'gemini' ? model.model : ''
    return {
      provider,
      modelName: provider === 'ollama' ? (model.variant ?? '') : '',
      apiKey: model.key ?? '',
      geminiVariant: provider === 'gemini' && model.variant ? model.variant : DEFAULT_GEMINI_VARIANT
    }
  } catch {
    return { provider: '', modelName: '', apiKey: '', geminiVariant: DEFAULT_GEMINI_VARIANT }
  }
}

async function saveModelConfig(model: ModelConfig): Promise<void> {
  // Preserve any other sections that may exist in config.ini.
  let cfg: Record<string, unknown> = {}
  try {
    cfg = parse(await window.api.readConfig())
  } catch {
    // No config yet — start fresh.
  }
  cfg.model =
    model.provider === 'ollama'
      ? { model: 'ollama', variant: model.modelName }
      : { model: 'gemini', variant: model.geminiVariant, key: model.apiKey }
  await window.api.writeConfig(stringify(cfg))
  // The agent reads config.ini at import time, so apply via a server restart.
  await window.api.restartAdk()
}

export function SettingsDialog({open,setOpen,onNoConfig = false} : SettingsDialogProps): React.JSX.Element {
  const [helpOpen, setHelpOpen] = useState(false)
  const [token, setToken] = useState('')
  const [savedToken, setSavedToken] = useState('')
  const [provider, setProvider] = useState<Provider>('')
  const [modelName, setModelName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [savedModel, setSavedModel] = useState<ModelConfig | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch the stored token and model config only when the dialog opens; the
  // password inputs keep secrets masked.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoading(true)
    Promise.all([loadToken(), loadModelConfig()]).then(([existingToken, model]) => {
      if (cancelled) return
      setToken(existingToken)
      setSavedToken(existingToken)
      setProvider(model.provider)
      setModelName(model.modelName)
      setApiKey(model.provider === 'gemini' ? model.apiKey : '')
      setSavedModel(model)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  const modelValid =
    provider === 'ollama' ? modelName.trim() !== '' : provider === 'gemini' ? apiKey.trim() !== '' : false
  const modelChanged =
    savedModel !== null &&
    (provider !== savedModel.provider ||
      (provider === 'ollama' && modelName.trim() !== savedModel.modelName) ||
      (provider === 'gemini' && apiKey.trim() !== savedModel.apiKey))
  const tokenChanged = token.trim() !== '' && token.trim() !== savedToken
  const canSave = modelValid && (modelChanged || tokenChanged)

  const save = async (): Promise<void> => {
    if (!canSave || saving) return
    setSaving(true)
    try {
      if (modelChanged) {
        await saveModelConfig({
          provider,
          modelName: modelName.trim(),
          apiKey: apiKey.trim(),
          geminiVariant: savedModel?.geminiVariant ?? DEFAULT_GEMINI_VARIANT
        })
      }
      if (tokenChanged) {
        await saveToken(token.trim())
      }
      toast.success('Settings saved')
      setOpen(false)
    } catch (e) {
      if ((e as Error).name !== 'BackendDownError') toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onNoConfig ? undefined : setOpen}>
      <DialogContent showCloseButton={!onNoConfig}>
        <DialogHeader>
          <DialogTitle>{onNoConfig ? "Welcome to SNUC Agent!" : "Settings"}</DialogTitle>
          <DialogDescription>
            {onNoConfig
              ? "Before you start chatting, pick the model the agent should run on and link your Digiicampus account."
              : "Manage your AI model and Digiicampus authentication."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Label htmlFor="model-provider">Model provider</Label>
          <Select
            value={provider}
            onValueChange={(value) => setProvider(value as Provider)}
            disabled={loading}
          >
            <SelectTrigger id="model-provider" className="w-full">
              <SelectValue placeholder={loading ? 'Loading…' : 'Select a provider'} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ollama">Ollama</SelectItem>
              <SelectItem value="gemini">Gemini</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {provider === 'ollama' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="ollama-model">Model name</Label>
            <Input
              id="ollama-model"
              value={modelName}
              onChange={(e) => setModelName(e.target.value)}
              placeholder="e.g. qwen3:latest"
              disabled={loading}
              autoComplete="off"
            />
            <p className="text-xs text-muted-foreground">
              A model available in your local Ollama install.
            </p>
          </div>
        )}

        {provider === 'gemini' && (
          <div className="flex flex-col gap-2">
            <Label htmlFor="gemini-key">API key</Label>
            <Input
              id="gemini-key"
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Your Google AI Studio API key"
              disabled={loading}
              autoComplete="off"
            />
          </div>
        )}

        <div className="flex flex-col gap-2">
          <Label htmlFor="digiicampus-token">Digiicampus token</Label>
          <div className="relative">
            <Input
              id="digiicampus-token"
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={loading ? '' : 'Paste your Auth-Token (JWT)'}
              disabled={loading}
              autoComplete="off"
              className="pr-8"
            />
            {loading && (
              <Loader2Icon className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="w-fit text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Where do I find my Digiicampus token?
          </button>
        </div>

        <DialogFooter>
          <Button onClick={save} disabled={loading || saving || !canSave}>
            {saving && <Loader2Icon className="animate-spin" />}
            {saving && modelChanged ? 'Restarting backend…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Finding your Digiicampus token</DialogTitle>
            <DialogDescription>
              The token is stored as a browser cookie once you're signed in — here's how to copy
              it.
            </DialogDescription>
          </DialogHeader>
          <ol className="list-decimal space-y-2 pl-5 text-sm">
            <li>Open Google Chrome and sign in to Digiicampus.</li>
            <li>Right-click anywhere on the page and choose "Inspect" to open Developer Tools.</li>
            <li>Switch to the "Application" tab.</li>
            <li>
              In the left sidebar, expand "Cookies" and select{' '}
              <code className="font-mono text-xs">https://snuc.digiicampus.com</code>.
            </li>
            <li>Find the cookie named "user", copy its value, and paste it into the field above.</li>
          </ol>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
