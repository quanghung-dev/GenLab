'use client';

import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { ArrowRight, Boxes, Film, GitBranch, ShieldCheck, Sparkles } from 'lucide-react';
import { apiRequest, setSession, type Session } from '@/lib/api';
import { Button, Input } from '@/components/ui';

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState<string | null>(null);
  const mutation = useMutation({
    mutationFn: async (form: HTMLFormElement) => {
      const data = new FormData(form);
      const endpoint = mode === 'login' ? '/auth/login' : '/auth/register';
      const body =
        mode === 'login'
          ? { email: data.get('email'), password: data.get('password') }
          : {
              displayName: data.get('displayName'),
              email: data.get('email'),
              password: data.get('password'),
              workspaceName: data.get('workspaceName') || undefined,
            };
      return apiRequest<Session>(endpoint, {
        method: 'POST',
        authenticated: false,
        body: JSON.stringify(body),
      });
    },
    onSuccess: (session) => {
      setSession(session);
      window.location.assign('/dashboard');
    },
    onError: (value) => setError(value instanceof Error ? value.message : 'Sign in failed.'),
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    setError(null);
    mutation.mutate(event.currentTarget);
  }

  return (
    <main className="auth-page">
      <section className="auth-story">
        <div className="auth-orb auth-orb-one" />
        <div className="auth-orb auth-orb-two" />
        <div className="auth-brand"><span className="brand-mark"><Sparkles size={17} /></span> GenFlow</div>
        <div className="auth-message">
          <span className="eyebrow">Visual AI orchestration</span>
          <h1>Turn creative logic into a workflow you can trust.</h1>
          <p>Design once. Switch providers, inspect every execution, and keep generated assets attached to the exact workflow version that created them.</p>
        </div>
        <div className="auth-pipeline" aria-hidden="true">
          <div className="mini-node"><GitBranch size={16} /><span>Prompt</span></div>
          <span className="mini-edge" />
          <div className="mini-node active"><Sparkles size={16} /><span>Generate</span></div>
          <span className="mini-edge" />
          <div className="mini-node"><Film size={16} /><span>Compose</span></div>
          <span className="mini-edge" />
          <div className="mini-node"><Boxes size={16} /><span>Asset</span></div>
        </div>
        <div className="auth-trust"><ShieldCheck size={17} /> Provider keys stay server-side and encrypted.</div>
      </section>

      <section className="auth-form-wrap">
        <form className="auth-form" onSubmit={submit}>
          <div className="segmented-control" aria-label="Authentication mode">
            <button type="button" className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Sign in</button>
            <button type="button" className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Create account</button>
          </div>
          <div className="form-heading">
            <h2>{mode === 'login' ? 'Welcome back' : 'Create your workspace'}</h2>
            <p>{mode === 'login' ? 'Continue building where you left off.' : 'Mock mode lets you run your first pipeline for free.'}</p>
          </div>
          {mode === 'register' ? (
            <>
              <label>Display name<Input name="displayName" autoComplete="name" required minLength={2} placeholder="Alex Kim" /></label>
              <label>Workspace name<Input name="workspaceName" placeholder="Northstar Studio" /></label>
            </>
          ) : null}
          <label>Email<Input name="email" type="email" autoComplete="email" required placeholder="you@studio.com" /></label>
          <label>Password<Input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength={mode === 'login' ? 1 : 10} placeholder="At least 10 characters" /></label>
          {error ? <div className="form-error" role="alert">{error}</div> : null}
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Please wait…' : mode === 'login' ? 'Enter workspace' : 'Create workspace'}
            <ArrowRight size={16} />
          </Button>
          <small className="form-note">By continuing, you agree to keep provider credentials authorized for your own use.</small>
        </form>
      </section>
    </main>
  );
}
