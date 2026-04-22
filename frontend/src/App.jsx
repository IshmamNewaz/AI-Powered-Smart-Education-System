import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BookOpen, ChartNoAxesCombined, GraduationCap, Library, MessageSquarePlus, Pencil, Sparkles, Trash2, WandSparkles } from 'lucide-react'

import {
  deleteAiThread,
  fetchAiThreadMessages,
  fetchAiThreads,
  fetchDashboard,
  fetchGradeReport,
  fetchSession,
  login,
  predictGradeReport,
  renameAiThread,
  logout,
  sendAiMessageStream,
} from '@/api'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AppDropdownContent, AppDropdownItem, DropdownMenu, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'

const LEFT_MENU_ICONS = {
  Academics: GraduationCap,
  'Grade Reports': ChartNoAxesCombined,
  Library,
  Others: BookOpen,
  'AI Help': WandSparkles,
  Notifications: Bell,
}

const USER_TYPE_LABELS = {
  1: 'Student',
  2: 'Teacher',
  3: 'Management',
}

function LoginPage({ onLogin, loading, error }) {
  const [name, setName] = useState('admin')
  const [password, setPassword] = useState('12345678')

  const submitLogin = async (event) => {
    event.preventDefault()
    await onLogin(name, password)
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_20%_20%,#164e8e_0%,#0a1733_38%,#030712_100%)] p-4 sm:p-8">
      <div className="mx-auto flex min-h-[calc(100vh-2rem)] w-full max-w-6xl items-center justify-center">
        <Card className="w-full max-w-md border-sky-700/40 bg-slate-950/85">
          <CardHeader>
            <p className="text-xs uppercase tracking-[0.35em] text-sky-300">AI Smart Education</p>
            <CardTitle className="font-heading text-3xl">ASEMS Login</CardTitle>
            <CardDescription>Use the configured credentials to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={submitLogin} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm text-slate-300" htmlFor="name">
                  Username
                </label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="admin" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm text-slate-300" htmlFor="password">
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="12345678"
                  required
                />
              </div>
              {error ? <p className="text-sm text-rose-300">{error}</p> : null}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Signing in...' : 'Sign in'}
              </Button>
              <p className="text-xs text-slate-400">Default login: admin / 12345678</p>
            </form>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

function AIHelpPanel({ user, showToast }) {
  const [threads, setThreads] = useState([])
  const [activeThreadId, setActiveThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [loadingThreads, setLoadingThreads] = useState(false)
  const [chatLoading, setChatLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const messagesRef = useRef(null)

  const loadThreads = async () => {
    setLoadingThreads(true)
    try {
      const payload = await fetchAiThreads()
      setThreads(payload.threads || [])
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoadingThreads(false)
    }
  }

  const loadThreadMessages = async (threadId) => {
    if (!threadId) {
      setMessages([])
      return
    }

    try {
      const payload = await fetchAiThreadMessages(threadId)
      setMessages(payload.messages || [])
      setActiveThreadId(threadId)
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  useEffect(() => {
    loadThreads()
  }, [])

  useEffect(() => {
    if (!messagesRef.current) {
      return
    }
    messagesRef.current.scrollTop = messagesRef.current.scrollHeight
  }, [messages])

  const startNewChat = () => {
    setActiveThreadId(null)
    setMessages([])
    setErrorMessage('')
    setMessageInput('')
  }

  const submitPrompt = async (event) => {
    event.preventDefault()
    const prompt = messageInput.trim()
    if (!prompt || chatLoading) {
      return
    }

    setErrorMessage('')
    setChatLoading(true)
    const userTempId = `temp-user-${Date.now()}`
    const assistantTempId = `temp-assistant-${Date.now()}`
    setMessages((prev) => [
      ...prev,
      {
      id: userTempId,
        role: 'user',
        content: prompt,
      },
      {
      id: assistantTempId,
      role: 'assistant',
      content: '',
      },
    ])
    setMessageInput('')

    try {
      await sendAiMessageStream(prompt, activeThreadId, {
      onThread: (thread) => {
        setActiveThreadId(thread.id)
      },
      onChunk: (chunk) => {
        setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantTempId
          ? { ...message, content: `${message.content}${chunk}` }
          : message,
        ),
        )
      },
      onDone: (eventPayload) => {
        setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantTempId ? eventPayload.assistant_message : message,
        ),
        )
      },
      })
      await loadThreads()
    } catch (error) {
      setMessages((prev) => prev.filter((message) => message.id !== assistantTempId))
      setErrorMessage(error.message)
      showToast('AI request failed.')
    } finally {
      setChatLoading(false)
    }
  }

    const handleRenameThread = async (thread) => {
    const title = window.prompt('Rename chat', thread.title)
    if (!title || title.trim() === thread.title) {
      return
    }

    try {
      await renameAiThread(thread.id, title.trim())
      await loadThreads()
      if (thread.id === activeThreadId) {
      await loadThreadMessages(thread.id)
      }
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Unable to rename chat.')
    }
    }

    const handleDeleteThread = async (thread) => {
    if (!window.confirm(`Delete chat: ${thread.title}?`)) {
      return
    }

    try {
      await deleteAiThread(thread.id)
      if (thread.id === activeThreadId) {
      setActiveThreadId(null)
      setMessages([])
      }
      await loadThreads()
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Unable to delete chat.')
    }
    }

  return (
    <div className="grid min-h-155 grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
      <Card className="border-slate-800 bg-slate-950/80">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="text-base">Old Chats</CardTitle>
            <Button variant="outline" size="sm" onClick={startNewChat}>
              <MessageSquarePlus size={14} />
              New
            </Button>
          </div>
          <CardDescription>Click a conversation to continue.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {loadingThreads ? <p className="text-sm text-slate-400">Loading chats...</p> : null}
          <div className="max-h-117.5 space-y-2 overflow-auto pr-1">
            {threads.length === 0 ? <p className="text-sm text-slate-400">No previous chats yet.</p> : null}
            {threads.map((thread) => (
              <div
                key={thread.id}
                className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
                  thread.id === activeThreadId
                    ? 'border-sky-400/60 bg-sky-500/10 text-sky-100'
                    : 'border-slate-800 bg-slate-900/70 text-slate-200 hover:border-slate-700 hover:bg-slate-800'
                }`}
              >
                <button onClick={() => loadThreadMessages(thread.id)} className="w-full text-left">
                  <p className="line-clamp-1 font-medium">{thread.title}</p>
                  <p className="mt-1 text-xs text-slate-400">#{thread.id}</p>
                </button>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => handleRenameThread(thread)}>
                    <Pencil size={13} />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 px-2 text-rose-300 hover:text-rose-200" onClick={() => handleDeleteThread(thread)}>
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border-sky-700/40 bg-slate-950/80">
        <CardHeader>
          <CardTitle className="font-heading text-xl">AI Help</CardTitle>
          <CardDescription>
            Powered by Ollama model: hf.co/unsloth/Llama-3.2-1B-Instruct-GGUF:UD-Q4_K_XL
          </CardDescription>
        </CardHeader>
        <CardContent className="flex h-140 flex-col gap-3">
          <div ref={messagesRef} className="flex-1 space-y-3 overflow-auto rounded-lg border border-slate-800 bg-slate-950/70 p-3">
            {messages.length === 0 ? (
              <div className="grid h-full place-items-center text-center text-slate-400">
                <p className="max-w-md text-sm">
                  Start a new conversation or open an old chat. Ask for lessons, quizzes, summaries, or explanations.
                </p>
              </div>
            ) : null}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm leading-6 ${
                    message.role === 'user'
                      ? 'bg-sky-500/90 text-slate-950'
                      : 'border border-slate-700 bg-slate-900 text-slate-100'
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}

            {chatLoading ? (
              <div className="flex justify-start">
                <div className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-300">Generating response...</div>
              </div>
            ) : null}
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

          <form onSubmit={submitPrompt} className="flex gap-2">
            <Input
              value={messageInput}
              onChange={(event) => setMessageInput(event.target.value)}
              placeholder={`Ask anything, ${user?.name || 'user'}...`}
              disabled={chatLoading}
            />
            <Button type="submit" disabled={chatLoading}>
              Send
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}

function GradeReportPanel({ user, showToast }) {
  const [mode, setMode] = useState('semester')
  const [studentId, setStudentId] = useState(String(user?.user_id || '1000'))
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [predicting, setPredicting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const loadReport = async (nextMode = mode) => {
    setLoadingReport(true)
    setErrorMessage('')
    try {
      const payload = await fetchGradeReport(nextMode, studentId)
      setReport(payload)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoadingReport(false)
    }
  }

  useEffect(() => {
    loadReport('semester')
  }, [])

  const handleModeChange = async (event) => {
    const nextMode = event.target.value
    setMode(nextMode)
    await loadReport(nextMode)
  }

  const buildResultSheet = () => {
    if (!report) {
      return []
    }

    if (report.mode === 'semester' && report.semesters?.length >= 2) {
      const sem1 = report.semesters.find((semester) => semester.semester === 1)
      const sem2 = report.semesters.find((semester) => semester.semester === 2)
      if (!sem1 || !sem2) {
        return []
      }

      return sem1.subjects.map((subjectRow) => {
        const sem2Subject = sem2.subjects.find((item) => item.subject === subjectRow.subject)
        const sem1Ct = subjectRow.ct_scores || [0, 0, 0, 0]
        const sem2Ct = sem2Subject?.ct_scores || [0, 0, 0, 0]
        return {
          student_id: report.student_id,
          subject: subjectRow.subject,
          ct_1: sem1Ct[0] ?? 0,
          ct_2: sem1Ct[1] ?? 0,
          ct_3: sem1Ct[2] ?? 0,
          ct_4: sem1Ct[3] ?? 0,
          ct_5: sem2Ct[0] ?? 0,
          ct_6: sem2Ct[1] ?? 0,
          ct_7: sem2Ct[2] ?? 0,
          ct_8: sem2Ct[3] ?? 0,
          term_1: subjectRow.term ?? 0,
          term_2: sem2Subject?.term ?? 0,
          model_1: subjectRow.model ?? 0,
          model_2: sem2Subject?.model ?? 0,
          model_3: Math.round(((subjectRow.model ?? 0) + (sem2Subject?.model ?? 0)) / 2),
        }
      })
    }

    const fallbackSubjects = report.subject_list || []
    return fallbackSubjects.map((subject) => ({
      student_id: report.student_id,
      subject,
    }))
  }

  const handlePredict = async () => {
    setPredicting(true)
    setErrorMessage('')
    try {
      const resultSheet = buildResultSheet()
      const payload = await predictGradeReport(report?.student_id || studentId, resultSheet)
      setPrediction(payload)
      showToast('Prediction completed.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Prediction failed.')
    } finally {
      setPredicting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-800 bg-slate-950/80">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Grade Report</CardTitle>
          <CardDescription>Review report by curriculum or by semester, then predict pass/fail for the next semester.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[220px_180px_1fr]">
            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Report Type</label>
              <select
                value={mode}
                onChange={handleModeChange}
                className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              >
                <option value="curriculum">By Curriculum</option>
                <option value="semester">By Semester</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Student ID</label>
              <Input value={studentId} onChange={(event) => setStudentId(event.target.value)} placeholder="1000" />
            </div>

            <div className="flex items-end gap-2">
              <Button variant="outline" onClick={() => loadReport(mode)} disabled={loadingReport}>
                {loadingReport ? 'Loading...' : 'Load Report'}
              </Button>
              <Button onClick={handlePredict} disabled={predicting || !report}>
                {predicting ? 'Predicting...' : 'Predict Next Sem Pass/Fail'}
              </Button>
            </div>
          </div>

          {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}

          {report?.mode === 'semester' ? (
            <div className="space-y-4">
              {report.semesters?.map((semester) => (
                <Card key={semester.semester} className="border-slate-800 bg-slate-900/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">Semester {semester.semester}</CardTitle>
                    <CardDescription>Dummy report generated from dataset.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="overflow-auto">
                      <table className="w-full min-w-175 text-left text-sm">
                        <thead>
                          <tr className="text-slate-400">
                            <th className="py-2">Subject</th>
                            <th className="py-2">CT Scores</th>
                            <th className="py-2">Term</th>
                            <th className="py-2">Model</th>
                            <th className="py-2">Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {semester.subjects?.map((subjectRow) => (
                            <tr key={`${semester.semester}-${subjectRow.subject}`} className="border-t border-slate-800">
                              <td className="py-2">{subjectRow.subject}</td>
                              <td className="py-2">{subjectRow.ct_scores.join(', ')}</td>
                              <td className="py-2">{subjectRow.term}</td>
                              <td className="py-2">{subjectRow.model}</td>
                              <td className="py-2 font-medium text-sky-200">{subjectRow.total}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className="text-xs text-slate-400">Average total: {semester.average_total}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}

          {report?.mode === 'curriculum' ? (
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg">By Curriculum</CardTitle>
                <CardDescription>Compare Semester 1 and Semester 2 progression by subject.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <table className="w-full min-w-162.5 text-left text-sm">
                    <thead>
                      <tr className="text-slate-400">
                        <th className="py-2">Subject</th>
                        <th className="py-2">Semester 1</th>
                        <th className="py-2">Semester 2</th>
                        <th className="py-2">Trend</th>
                      </tr>
                    </thead>
                    <tbody>
                      {report.curriculum?.map((row) => (
                        <tr key={row.subject} className="border-t border-slate-800">
                          <td className="py-2">{row.subject}</td>
                          <td className="py-2">{row.semester_1_total}</td>
                          <td className="py-2">{row.semester_2_total}</td>
                          <td className={`py-2 font-medium ${row.trend >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                            {row.trend >= 0 ? '+' : ''}
                            {row.trend}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      {prediction ? (
        <Card className="border-sky-700/40 bg-slate-950/80">
          <CardHeader>
            <CardTitle className="text-lg">Semester 3 Prediction</CardTitle>
            <CardDescription>{prediction.semester_3_prediction}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {prediction.subject_predictions?.map((item) => (
              <div key={item.subject} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                <p className="font-medium text-slate-100">{item.subject}</p>
                <p className="text-sm text-slate-300">Prediction: {item.prediction}</p>
                {item.pass_probability !== null ? (
                  <p className="text-sm text-slate-400">Pass Probability: {Math.round(item.pass_probability * 100)}%</p>
                ) : null}
                <details className="mt-2 text-xs text-slate-400">
                  <summary className="cursor-pointer">Show result sheet numbers sent to model</summary>
                  <pre className="mt-2 overflow-auto rounded bg-slate-950 p-2 text-[11px]">
                    {JSON.stringify(item.input_sheet, null, 2)}
                  </pre>
                </details>
              </div>
            ))}

            {prediction.llm_output ? (
              <div className="rounded-md border border-sky-700/40 bg-slate-900/70 p-3">
                <p className="mb-2 font-medium text-sky-200">LLM Analysis</p>
                <pre className="whitespace-pre-wrap text-sm text-slate-200">{prediction.llm_output}</pre>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function Dashboard({ user, menus, dashboardMessage, onLogout, onProfileAction, loading, showToast }) {
  const [activeSection, setActiveSection] = useState('Academics')

  const initials = useMemo(
    () =>
      user?.name
        ?.split(' ')
        .map((part) => part[0])
        .join('')
        .slice(0, 2)
        .toUpperCase() || 'U',
    [user],
  )

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#020617_0%,#0a1733_55%,#071126_100%)] text-slate-100">
      <header className="sticky top-0 z-20 border-b border-slate-800/90 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-400 flex-wrap items-center justify-between gap-4 px-4 py-3 lg:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 place-items-center rounded-xl border border-sky-300/40 bg-linear-to-br from-white via-slate-100 to-sky-100 shadow-[0_0_0_1px_rgba(255,255,255,0.35),0_12px_28px_-12px_rgba(14,165,233,0.9)]">
              <img
                src="/logo/ASEMS-LOGO.png"
                alt="ASEMS logo"
                className="h-10 w-10 object-contain drop-shadow-[0_2px_2px_rgba(0,0,0,0.35)]"
              />
            </div>
            <div>
              <p className="font-heading text-xl tracking-wide">ASEMS</p>
              <p className="text-xs uppercase tracking-[0.28em] text-sky-300">Smart Education</p>
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1 rounded-xl border border-slate-800 bg-slate-900/80 p-1">
            {menus?.top?.items?.map((item) => (
              <button key={item} className="rounded-md px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white">
                {item}
              </button>
            ))}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 transition hover:bg-slate-800">
                <Avatar>
                  <AvatarFallback>{initials}</AvatarFallback>
                </Avatar>
                <div className="text-left">
                  <p className="text-sm font-medium">{user?.name || 'User'}</p>
                  <p className="text-xs text-slate-400">{USER_TYPE_LABELS[user?.user_type] || 'Member'}</p>
                </div>
              </button>
            </DropdownMenuTrigger>
            <AppDropdownContent align="end">
              {menus?.top?.profile_dropdown?.map((item) => (
                <AppDropdownItem
                  key={item}
                  onSelect={() => {
                    if (item.toLowerCase() === 'logout') {
                      onLogout()
                    } else {
                      onProfileAction(item)
                    }
                  }}
                >
                  {item}
                </AppDropdownItem>
              ))}
            </AppDropdownContent>
          </DropdownMenu>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-400 grid-cols-1 gap-6 p-4 lg:grid-cols-[260px_1fr] lg:p-6">
        <aside className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4 shadow-[0_15px_70px_-40px_rgba(14,165,233,0.6)]">
          <h2 className="font-heading text-lg text-sky-200">Navigation</h2>
          <Separator className="my-3" />
          <ul className="space-y-1">
            {menus?.left?.map((item) => {
              const Icon = LEFT_MENU_ICONS[item] || Sparkles
              return (
                <li key={item}>
                  <button
                    onClick={() => setActiveSection(item)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                      activeSection === item
                        ? 'bg-sky-500/20 text-sky-100'
                        : 'text-slate-200 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <Icon size={16} className="text-sky-300" />
                    <span>{item}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>

        <div className="space-y-6">
          {activeSection === 'AI Help' ? <AIHelpPanel user={user} showToast={showToast} /> : null}
          {activeSection === 'Grade Reports' ? <GradeReportPanel user={user} showToast={showToast} /> : null}

          {activeSection !== 'AI Help' && activeSection !== 'Grade Reports' ? (
            <>
          <Card className="overflow-hidden border-sky-700/40 bg-linear-to-r from-slate-950 via-slate-900 to-sky-950">
            <CardHeader>
              <CardTitle className="font-heading text-2xl">{dashboardMessage || 'Welcome to ASEMS'}</CardTitle>
              <CardDescription>Personalized tools for academics, reports, library, and AI support.</CardDescription>
            </CardHeader>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {[
              { title: 'Courses and Result', desc: 'Track coursework progress and latest outcomes.' },
              { title: 'Registration', desc: 'Manage enrollment and semester planning.' },
              { title: 'Grade Report', desc: 'Analyze grade trends and performance summaries.' },
            ].map((card) => (
              <Card key={card.title}>
                <CardHeader>
                  <CardTitle className="text-lg">{card.title}</CardTitle>
                  <CardDescription>{card.desc}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">User Summary</CardTitle>
              <CardDescription>Current signed-in profile from backend API.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-slate-300">
              <p>
                <span className="text-slate-400">User ID:</span> {user?.user_id}
              </p>
              <p>
                <span className="text-slate-400">Name:</span> {user?.name}
              </p>
              <p>
                <span className="text-slate-400">User Type:</span> {USER_TYPE_LABELS[user?.user_type] || 'Unknown'}
              </p>
              <Button variant="outline" onClick={onLogout} disabled={loading} className="mt-2">
                {loading ? 'Processing...' : 'Logout'}
              </Button>
            </CardContent>
          </Card>
            </>
          ) : null}
        </div>
      </section>
    </main>
  )
}

function App() {
  const [bootLoading, setBootLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [authError, setAuthError] = useState('')
  const [toast, setToast] = useState('')
  const [authenticated, setAuthenticated] = useState(false)
  const [user, setUser] = useState(null)
  const [menus, setMenus] = useState({ top: { items: [], profile_dropdown: [] }, left: [] })
  const [dashboardMessage, setDashboardMessage] = useState('')

  useEffect(() => {
    const initSession = async () => {
      try {
        const sessionPayload = await fetchSession()
        setAuthenticated(Boolean(sessionPayload.authenticated))
        setMenus(sessionPayload.menus)
        setUser(sessionPayload.user || null)

        if (sessionPayload.authenticated) {
          const dashboardPayload = await fetchDashboard()
          setDashboardMessage(dashboardPayload.welcome)
        }
      } catch {
        setAuthError('Could not reach backend API. Ensure Django is running on port 8000.')
      } finally {
        setBootLoading(false)
      }
    }

    initSession()
  }, [])

  const handleLogin = async (name, password) => {
    setActionLoading(true)
    setAuthError('')

    try {
      const payload = await login(name, password)
      setAuthenticated(true)
      setUser(payload.user)
      setMenus(payload.menus)

      const dashboardPayload = await fetchDashboard()
      setDashboardMessage(dashboardPayload.welcome)
    } catch (error) {
      setAuthError(error.message)
    } finally {
      setActionLoading(false)
    }
  }

  const handleLogout = async () => {
    setActionLoading(true)
    try {
      await logout()
      setAuthenticated(false)
      setUser(null)
      setDashboardMessage('')
      const sessionPayload = await fetchSession()
      setMenus(sessionPayload.menus)
    } catch {
      setToast('Unable to logout right now.')
    } finally {
      setActionLoading(false)
    }
  }

  const handleProfileAction = (action) => {
    setToast(`${action} clicked.`)
    window.setTimeout(() => setToast(''), 1600)
  }

  const showToast = (message) => {
    setToast(message)
    window.setTimeout(() => setToast(''), 1800)
  }

  if (bootLoading) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-950 text-slate-100">
        <p className="animate-pulse text-sm tracking-[0.2em] text-sky-300">LOADING ASEMS...</p>
      </main>
    )
  }

  return (
    <>
      {authenticated ? (
        <Dashboard
          user={user}
          menus={menus}
          dashboardMessage={dashboardMessage}
          onLogout={handleLogout}
          onProfileAction={handleProfileAction}
          loading={actionLoading}
          showToast={showToast}
        />
      ) : (
        <LoginPage onLogin={handleLogin} loading={actionLoading} error={authError} />
      )}
      {toast ? (
        <div className="fixed bottom-5 right-5 rounded-md border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-slate-100 shadow-xl">
          {toast}
        </div>
      ) : null}
    </>
  )
}

export default App
