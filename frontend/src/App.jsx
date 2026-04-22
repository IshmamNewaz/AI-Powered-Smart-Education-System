import { useEffect, useMemo, useRef, useState } from 'react'
import { Bell, BookOpen, CalendarDays, ChartNoAxesCombined, GraduationCap, Library, MessageSquarePlus, Pencil, Sparkles, Trash2, WandSparkles } from 'lucide-react'

import {
  deleteAiThread,
  fetchAiThreadMessages,
  fetchAiThreads,
  fetchDashboard,
  fetchGradeReport,
  fetchGradeReportWithClass,
  fetchRegistrationList,
  fetchStudentsByClass,
  fetchTeacherMarks,
  fetchTeacherStudents,
  fetchWeeklySchedule,
  fetchLibraryApplications,
  fetchSession,
  login,
  predictGradeReport,
  predictGradeReportWithClass,
  renameAiThread,
  submitRegistration,
  assignCourse,
  submitLibraryApplication,
  upsertTeacherMark,
  updateRegistration,
  deleteRegistration,
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
  Registration: BookOpen,
  'Weekly Schedule': CalendarDays,
  'Assign Courses': BookOpen,
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
  const isManagement = user?.user_type === 3
  const [mode, setMode] = useState('semester')
  const [selectedClass, setSelectedClass] = useState('1')
  const [studentId, setStudentId] = useState(String(user?.user_id || ''))
  const [report, setReport] = useState(null)
  const [loadingReport, setLoadingReport] = useState(false)
  const [prediction, setPrediction] = useState(null)
  const [predicting, setPredicting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [classItems, setClassItems] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)

  const loadReport = async (nextMode = mode) => {
    setLoadingReport(true)
    setErrorMessage('')
    try {
      const payload = isManagement
        ? await fetchGradeReportWithClass(nextMode, studentId, selectedClass)
        : await fetchGradeReport(nextMode, null)
      setReport(payload)
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoadingReport(false)
    }
  }

  const loadClassStudents = async (className = selectedClass) => {
    if (!isManagement) {
      return
    }
    setLoadingStudents(true)
    setErrorMessage('')
    try {
      const payload = await fetchStudentsByClass(className)
      setClassItems(payload.items || [])
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoadingStudents(false)
    }
  }

  useEffect(() => {
    if (isManagement) {
      loadClassStudents('1')
    } else {
      loadReport('semester')
    }
  }, [])

  useEffect(() => {
    if (isManagement) {
      loadClassStudents(selectedClass)
    }
  }, [selectedClass])

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
      const payload = isManagement
        ? await predictGradeReportWithClass(report?.student_id || studentId, selectedClass, resultSheet)
        : await predictGradeReport(null, resultSheet)
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

            {isManagement ? (
              <div className="space-y-2">
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Class</label>
                <select
                  value={selectedClass}
                  onChange={(event) => setSelectedClass(event.target.value)}
                  className="h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                >
                  {[1,2,3,4,5,6,7,8,9,10].map((value) => (
                    <option key={value} value={String(value)}>{value}</option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="space-y-2">
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Student ID</label>
              <Input
                value={studentId}
                onChange={(event) => setStudentId(event.target.value)}
                placeholder={isManagement ? 'Search student ID' : String(user?.user_id || '')}
                disabled={!isManagement}
              />
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

          {isManagement ? (
            <Card className="border-slate-800 bg-slate-900/60">
              <CardHeader>
                <CardTitle className="text-lg">Student List by Class {selectedClass}</CardTitle>
                <CardDescription>Use this list to pick student IDs, then load report and prediction.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {loadingStudents ? <p className="text-sm text-slate-400">Loading students...</p> : null}
                {classItems
                  .filter((item) => item.class_name === selectedClass)
                  .flatMap((item) => item.students || [])
                  .map((student) => (
                    <button
                      key={student.user_id}
                      onClick={() => setStudentId(String(student.user_id))}
                      className="block w-full rounded-md border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-700"
                    >
                      {student.full_name || student.username} (ID: {student.user_id})
                    </button>
                  ))}
                {classItems
                  .filter((item) => item.class_name === selectedClass)
                  .flatMap((item) => item.students || []).length === 0 && !loadingStudents ? (
                  <p className="text-sm text-slate-400">No registered students found in this class.</p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

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

function RegistrationPanel({ showToast }) {
  const [activeRole, setActiveRole] = useState('student')
  const [activePage, setActivePage] = useState('form')
  const [submitting, setSubmitting] = useState(false)
  const [loadingList, setLoadingList] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [listItems, setListItems] = useState([])
  const [editingItem, setEditingItem] = useState(null)
  const [editPayload, setEditPayload] = useState({})
  const [editPhoto, setEditPhoto] = useState(null)

  const [studentForm, setStudentForm] = useState({
    full_name: '',
    roll_number: '',
    date_of_birth: '',
    gender: '',
    profile_photo: '',
    profile_photo_file: null,
    email_address: '',
    phone_number: '',
    address: '',
    emergency_contact_number: '',
    institution_name: '',
    department_program: '',
    class_semester_year: '',
    academic_session: '',
    username: '',
    password: '',
    confirm_password: '',
    learning_goals: '',
    preferred_learning_style: 'Mixed',
    subjects_of_interest: [],
  })

  const [teacherForm, setTeacherForm] = useState({
    full_name: '',
    employee_id: '',
    date_of_birth: '',
    gender: '',
    profile_photo: '',
    profile_photo_file: null,
    email_address: '',
    phone_number: '',
    address: '',
    institution_name: '',
    department: '',
    designation: '',
    subjects_teaching: '',
    years_of_experience: '',
    highest_degree: '',
    university_institution: '',
    specialization: '',
    username: '',
    password: '',
    confirm_password: '',
    teaching_areas_of_expertise: '',
    preferred_ai_tools: '',
    availability_schedule: '',
  })

  const [managementForm, setManagementForm] = useState({
    full_name: '',
    employee_staff_id: '',
    date_of_birth: '',
    profile_photo: '',
    profile_photo_file: null,
    email_address: '',
    phone_number: '',
    office_address: '',
    institution_name: '',
    department: '',
    position: '',
    reporting_authority: '',
    username: '',
    password: '',
    confirm_password: '',
    role_type: 'Admin',
    access_permissions: [],
  })

  const studentSubjects = ['Math', 'Physics', 'Chemistry', 'Biology']
  const managementPermissions = [
    'Student Management',
    'Teacher Management',
    'Course Management',
    'Analytics Dashboard',
    'AI System Controls',
  ]

  const toggleArrayValue = (currentValues, value) => {
    if (currentValues.includes(value)) {
      return currentValues.filter((item) => item !== value)
    }
    return [...currentValues, value]
  }

  const commonInputClass = 'h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100'
  const labelClass = 'text-xs uppercase tracking-[0.18em] text-slate-400'

  const submitForm = async () => {
    setSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const payload =
        activeRole === 'student'
          ? studentForm
          : activeRole === 'teacher'
            ? teacherForm
            : managementForm

      const profilePhoto = payload.profile_photo_file || null
      const requestPayload = { ...payload }
      delete requestPayload.profile_photo_file

      const response = await submitRegistration(activeRole, requestPayload, profilePhoto)
      setSuccessMessage(`${response.message} Login User ID: ${response.registered_user.user_id}`)
      showToast('Registration submitted successfully.')
      if (activePage !== 'form') {
        await loadList(activeRole)
      }
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Registration failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const loadList = async (role = activeRole) => {
    setLoadingList(true)
    setErrorMessage('')
    try {
      const response = await fetchRegistrationList(role)
      setListItems(response.items || [])
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoadingList(false)
    }
  }

  const openEdit = (item) => {
    setEditingItem(item)
    setEditPayload({ ...item.profile_data, username: item.username, password: '', confirm_password: '' })
    setEditPhoto(null)
  }

  const saveEdit = async () => {
    if (!editingItem) {
      return
    }
    try {
      await updateRegistration(editingItem.id, editingItem.role, editPayload, editPhoto)
      setEditingItem(null)
      setEditPayload({})
      setEditPhoto(null)
      await loadList(activeRole)
      showToast('Registration updated successfully.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Update failed.')
    }
  }

  const removeItem = async (item) => {
    if (!window.confirm(`Delete ${item.full_name || item.username}?`)) {
      return
    }
    try {
      await deleteRegistration(item.id)
      await loadList(activeRole)
      showToast('Registration deleted successfully.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Delete failed.')
    }
  }

  useEffect(() => {
    if (activePage === 'list') {
      loadList(activeRole)
    }
  }, [activePage, activeRole])

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Registration</CardTitle>
        <CardDescription>Choose registration template: Students, Teachers, or Management.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button variant={activePage === 'form' ? 'default' : 'outline'} onClick={() => setActivePage('form')}>Registration Form</Button>
          <Button variant={activePage === 'list' ? 'default' : 'outline'} onClick={() => setActivePage('list')}>View List</Button>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { key: 'student', label: 'Students' },
            { key: 'teacher', label: 'Teachers' },
            { key: 'management', label: 'Management' },
          ].map((role) => (
            <Button
              key={role.key}
              variant={activeRole === role.key ? 'default' : 'outline'}
              onClick={() => setActiveRole(role.key)}
            >
              {role.label}
            </Button>
          ))}
        </div>

        {activeRole === 'student' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className={labelClass}>Full Name</label><Input value={studentForm.full_name} onChange={(e) => setStudentForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Roll Number (User ID)</label><Input value={studentForm.roll_number} onChange={(e) => setStudentForm((p) => ({ ...p, roll_number: e.target.value }))} /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" className={commonInputClass} value={studentForm.date_of_birth} onChange={(e) => setStudentForm((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
            <div><label className={labelClass}>Gender</label><Input value={studentForm.gender} onChange={(e) => setStudentForm((p) => ({ ...p, gender: e.target.value }))} /></div>
            <div><label className={labelClass}>Profile Photo</label><input type="file" className={commonInputClass} onChange={(e) => setStudentForm((p) => ({ ...p, profile_photo: e.target.files?.[0]?.name || '' }))} /></div>
            <div><label className={labelClass}>Profile Photo Upload</label><input type="file" className={commonInputClass} onChange={(e) => setStudentForm((p) => ({ ...p, profile_photo_file: e.target.files?.[0] || null }))} /></div>
            <div><label className={labelClass}>Email Address</label><Input value={studentForm.email_address} onChange={(e) => setStudentForm((p) => ({ ...p, email_address: e.target.value }))} /></div>
            <div><label className={labelClass}>Phone Number</label><Input value={studentForm.phone_number} onChange={(e) => setStudentForm((p) => ({ ...p, phone_number: e.target.value }))} /></div>
            <div><label className={labelClass}>Address</label><Input value={studentForm.address} onChange={(e) => setStudentForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div><label className={labelClass}>Emergency Contact</label><Input value={studentForm.emergency_contact_number} onChange={(e) => setStudentForm((p) => ({ ...p, emergency_contact_number: e.target.value }))} /></div>
            <div><label className={labelClass}>Institution Name</label><Input value={studentForm.institution_name} onChange={(e) => setStudentForm((p) => ({ ...p, institution_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Department / Program</label><Input value={studentForm.department_program} onChange={(e) => setStudentForm((p) => ({ ...p, department_program: e.target.value }))} /></div>
            <div><label className={labelClass}>Class / Semester / Year</label><Input value={studentForm.class_semester_year} onChange={(e) => setStudentForm((p) => ({ ...p, class_semester_year: e.target.value }))} /></div>
            <div><label className={labelClass}>Academic Session</label><Input value={studentForm.academic_session} onChange={(e) => setStudentForm((p) => ({ ...p, academic_session: e.target.value }))} /></div>
            <div><label className={labelClass}>Username</label><Input value={studentForm.username} onChange={(e) => setStudentForm((p) => ({ ...p, username: e.target.value }))} /></div>
            <div><label className={labelClass}>Password</label><Input type="password" value={studentForm.password} onChange={(e) => setStudentForm((p) => ({ ...p, password: e.target.value }))} /></div>
            <div><label className={labelClass}>Confirm Password</label><Input type="password" value={studentForm.confirm_password} onChange={(e) => setStudentForm((p) => ({ ...p, confirm_password: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Learning Goals</label><Input value={studentForm.learning_goals} onChange={(e) => setStudentForm((p) => ({ ...p, learning_goals: e.target.value }))} /></div>
            <div><label className={labelClass}>Preferred Learning Style</label><select className={commonInputClass} value={studentForm.preferred_learning_style} onChange={(e) => setStudentForm((p) => ({ ...p, preferred_learning_style: e.target.value }))}><option>Visual</option><option>Audio</option><option>Reading</option><option>Mixed</option></select></div>
            <div className="md:col-span-2">
              <label className={labelClass}>Subjects of Interest</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {studentSubjects.map((subject) => (
                  <label key={subject} className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={studentForm.subjects_of_interest.includes(subject)}
                      onChange={() => setStudentForm((p) => ({ ...p, subjects_of_interest: toggleArrayValue(p.subjects_of_interest, subject) }))}
                    />
                    {subject}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {activeRole === 'teacher' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className={labelClass}>Full Name</label><Input value={teacherForm.full_name} onChange={(e) => setTeacherForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Employee ID (User ID)</label><Input value={teacherForm.employee_id} onChange={(e) => setTeacherForm((p) => ({ ...p, employee_id: e.target.value }))} /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" className={commonInputClass} value={teacherForm.date_of_birth} onChange={(e) => setTeacherForm((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
            <div><label className={labelClass}>Gender</label><Input value={teacherForm.gender} onChange={(e) => setTeacherForm((p) => ({ ...p, gender: e.target.value }))} /></div>
            <div><label className={labelClass}>Profile Photo</label><input type="file" className={commonInputClass} onChange={(e) => setTeacherForm((p) => ({ ...p, profile_photo: e.target.files?.[0]?.name || '' }))} /></div>
            <div><label className={labelClass}>Profile Photo Upload</label><input type="file" className={commonInputClass} onChange={(e) => setTeacherForm((p) => ({ ...p, profile_photo_file: e.target.files?.[0] || null }))} /></div>
            <div><label className={labelClass}>Email Address</label><Input value={teacherForm.email_address} onChange={(e) => setTeacherForm((p) => ({ ...p, email_address: e.target.value }))} /></div>
            <div><label className={labelClass}>Phone Number</label><Input value={teacherForm.phone_number} onChange={(e) => setTeacherForm((p) => ({ ...p, phone_number: e.target.value }))} /></div>
            <div><label className={labelClass}>Address</label><Input value={teacherForm.address} onChange={(e) => setTeacherForm((p) => ({ ...p, address: e.target.value }))} /></div>
            <div><label className={labelClass}>Institution Name</label><Input value={teacherForm.institution_name} onChange={(e) => setTeacherForm((p) => ({ ...p, institution_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Department</label><Input value={teacherForm.department} onChange={(e) => setTeacherForm((p) => ({ ...p, department: e.target.value }))} /></div>
            <div><label className={labelClass}>Designation</label><Input value={teacherForm.designation} onChange={(e) => setTeacherForm((p) => ({ ...p, designation: e.target.value }))} /></div>
            <div><label className={labelClass}>Subjects Teaching</label><Input value={teacherForm.subjects_teaching} onChange={(e) => setTeacherForm((p) => ({ ...p, subjects_teaching: e.target.value }))} /></div>
            <div><label className={labelClass}>Years of Experience</label><Input value={teacherForm.years_of_experience} onChange={(e) => setTeacherForm((p) => ({ ...p, years_of_experience: e.target.value }))} /></div>
            <div><label className={labelClass}>Highest Degree</label><Input value={teacherForm.highest_degree} onChange={(e) => setTeacherForm((p) => ({ ...p, highest_degree: e.target.value }))} /></div>
            <div><label className={labelClass}>University/Institution</label><Input value={teacherForm.university_institution} onChange={(e) => setTeacherForm((p) => ({ ...p, university_institution: e.target.value }))} /></div>
            <div><label className={labelClass}>Specialization</label><Input value={teacherForm.specialization} onChange={(e) => setTeacherForm((p) => ({ ...p, specialization: e.target.value }))} /></div>
            <div><label className={labelClass}>Username</label><Input value={teacherForm.username} onChange={(e) => setTeacherForm((p) => ({ ...p, username: e.target.value }))} /></div>
            <div><label className={labelClass}>Password</label><Input type="password" value={teacherForm.password} onChange={(e) => setTeacherForm((p) => ({ ...p, password: e.target.value }))} /></div>
            <div><label className={labelClass}>Confirm Password</label><Input type="password" value={teacherForm.confirm_password} onChange={(e) => setTeacherForm((p) => ({ ...p, confirm_password: e.target.value }))} /></div>
            <div><label className={labelClass}>Teaching Areas of Expertise</label><Input value={teacherForm.teaching_areas_of_expertise} onChange={(e) => setTeacherForm((p) => ({ ...p, teaching_areas_of_expertise: e.target.value }))} /></div>
            <div><label className={labelClass}>Preferred AI Tools</label><Input value={teacherForm.preferred_ai_tools} onChange={(e) => setTeacherForm((p) => ({ ...p, preferred_ai_tools: e.target.value }))} /></div>
            <div className="md:col-span-2"><label className={labelClass}>Availability Schedule</label><Input value={teacherForm.availability_schedule} onChange={(e) => setTeacherForm((p) => ({ ...p, availability_schedule: e.target.value }))} /></div>
          </div>
        ) : null}

        {activeRole === 'management' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className={labelClass}>Full Name</label><Input value={managementForm.full_name} onChange={(e) => setManagementForm((p) => ({ ...p, full_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Employee/Staff ID (User ID)</label><Input value={managementForm.employee_staff_id} onChange={(e) => setManagementForm((p) => ({ ...p, employee_staff_id: e.target.value }))} /></div>
            <div><label className={labelClass}>Date of Birth</label><input type="date" className={commonInputClass} value={managementForm.date_of_birth} onChange={(e) => setManagementForm((p) => ({ ...p, date_of_birth: e.target.value }))} /></div>
            <div><label className={labelClass}>Profile Photo</label><input type="file" className={commonInputClass} onChange={(e) => setManagementForm((p) => ({ ...p, profile_photo: e.target.files?.[0]?.name || '' }))} /></div>
            <div><label className={labelClass}>Profile Photo Upload</label><input type="file" className={commonInputClass} onChange={(e) => setManagementForm((p) => ({ ...p, profile_photo_file: e.target.files?.[0] || null }))} /></div>
            <div><label className={labelClass}>Email Address</label><Input value={managementForm.email_address} onChange={(e) => setManagementForm((p) => ({ ...p, email_address: e.target.value }))} /></div>
            <div><label className={labelClass}>Phone Number</label><Input value={managementForm.phone_number} onChange={(e) => setManagementForm((p) => ({ ...p, phone_number: e.target.value }))} /></div>
            <div><label className={labelClass}>Office Address</label><Input value={managementForm.office_address} onChange={(e) => setManagementForm((p) => ({ ...p, office_address: e.target.value }))} /></div>
            <div><label className={labelClass}>Institution Name</label><Input value={managementForm.institution_name} onChange={(e) => setManagementForm((p) => ({ ...p, institution_name: e.target.value }))} /></div>
            <div><label className={labelClass}>Department</label><Input value={managementForm.department} onChange={(e) => setManagementForm((p) => ({ ...p, department: e.target.value }))} /></div>
            <div><label className={labelClass}>Position</label><Input value={managementForm.position} onChange={(e) => setManagementForm((p) => ({ ...p, position: e.target.value }))} /></div>
            <div><label className={labelClass}>Reporting Authority</label><Input value={managementForm.reporting_authority} onChange={(e) => setManagementForm((p) => ({ ...p, reporting_authority: e.target.value }))} /></div>
            <div><label className={labelClass}>Role Type</label><select className={commonInputClass} value={managementForm.role_type} onChange={(e) => setManagementForm((p) => ({ ...p, role_type: e.target.value }))}><option>Super Admin</option><option>Admin</option><option>Manager</option></select></div>
            <div><label className={labelClass}>Username</label><Input value={managementForm.username} onChange={(e) => setManagementForm((p) => ({ ...p, username: e.target.value }))} /></div>
            <div><label className={labelClass}>Password</label><Input type="password" value={managementForm.password} onChange={(e) => setManagementForm((p) => ({ ...p, password: e.target.value }))} /></div>
            <div><label className={labelClass}>Confirm Password</label><Input type="password" value={managementForm.confirm_password} onChange={(e) => setManagementForm((p) => ({ ...p, confirm_password: e.target.value }))} /></div>
            <div className="md:col-span-2">
              <label className={labelClass}>Access Permissions</label>
              <div className="mt-2 flex flex-wrap gap-3">
                {managementPermissions.map((permission) => (
                  <label key={permission} className="flex items-center gap-2 text-sm text-slate-200">
                    <input
                      type="checkbox"
                      checked={managementForm.access_permissions.includes(permission)}
                      onChange={() =>
                        setManagementForm((p) => ({
                          ...p,
                          access_permissions: toggleArrayValue(p.access_permissions, permission),
                        }))
                      }
                    />
                    {permission}
                  </label>
                ))}
              </div>
            </div>
          </div>
        ) : null}

        {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

        {activePage === 'form' ? (
          <Button onClick={submitForm} disabled={submitting}>
            {submitting ? 'Submitting...' : `Submit ${activeRole.charAt(0).toUpperCase() + activeRole.slice(1)} Registration`}
          </Button>
        ) : null}

        {activePage === 'list' ? (
          <div className="space-y-3">
            {loadingList ? <p className="text-sm text-slate-400">Loading {activeRole} list...</p> : null}
            {listItems.length === 0 && !loadingList ? <p className="text-sm text-slate-400">No records found.</p> : null}
            {listItems.map((item) => (
              <div key={item.id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-slate-100">{item.full_name || item.username}</p>
                    <p className="text-xs text-slate-400">User ID: {item.user_id} | Username: {item.username}</p>
                    <p className="text-xs text-slate-400">Email: {item.email_address || '-'} | Phone: {item.phone_number || '-'}</p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openEdit(item)}>Edit</Button>
                    <Button variant="danger" size="sm" onClick={() => removeItem(item)}>Delete</Button>
                  </div>
                </div>
                {item.profile_photo_url ? (
                  <img src={item.profile_photo_url} alt="Profile" className="mt-3 h-16 w-16 rounded-md border border-slate-700 object-cover" />
                ) : null}
              </div>
            ))}

            {editingItem ? (
              <div className="rounded-md border border-sky-700/40 bg-slate-900 p-3">
                <p className="mb-2 text-sm font-medium text-sky-200">Edit Record</p>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div><label className={labelClass}>Full Name</label><Input value={editPayload.full_name || ''} onChange={(e) => setEditPayload((p) => ({ ...p, full_name: e.target.value }))} /></div>
                  <div><label className={labelClass}>Email</label><Input value={editPayload.email_address || ''} onChange={(e) => setEditPayload((p) => ({ ...p, email_address: e.target.value }))} /></div>
                  <div><label className={labelClass}>Phone</label><Input value={editPayload.phone_number || ''} onChange={(e) => setEditPayload((p) => ({ ...p, phone_number: e.target.value }))} /></div>
                  <div><label className={labelClass}>Username</label><Input value={editPayload.username || ''} onChange={(e) => setEditPayload((p) => ({ ...p, username: e.target.value }))} /></div>
                  <div><label className={labelClass}>Password</label><Input type="password" value={editPayload.password || ''} onChange={(e) => setEditPayload((p) => ({ ...p, password: e.target.value }))} /></div>
                  <div><label className={labelClass}>Confirm Password</label><Input type="password" value={editPayload.confirm_password || ''} onChange={(e) => setEditPayload((p) => ({ ...p, confirm_password: e.target.value }))} /></div>
                  <div className="md:col-span-2"><label className={labelClass}>Replace Profile Photo</label><input type="file" className={commonInputClass} onChange={(e) => setEditPhoto(e.target.files?.[0] || null)} /></div>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={saveEdit}>Save Changes</Button>
                  <Button size="sm" variant="outline" onClick={() => setEditingItem(null)}>Cancel</Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function WeeklySchedulePanel() {
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [items, setItems] = useState([])

  const loadSchedule = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await fetchWeeklySchedule()
      setItems(response.items || [])
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSchedule()
  }, [])

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Weekly Class Schedule</CardTitle>
        <CardDescription>Scheduled courses assigned to your account.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button variant="outline" size="sm" onClick={loadSchedule} disabled={loading}>
          {loading ? 'Refreshing...' : 'Refresh Schedule'}
        </Button>
        {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
        {items.length === 0 && !loading ? <p className="text-sm text-slate-400">No schedule assigned yet.</p> : null}
        {items.map((item) => (
          <div key={item.assignment_id} className="rounded-md border border-slate-800 bg-slate-900/70 p-3">
            <p className="font-medium text-slate-100">{item.course_name}</p>
            <p className="text-xs text-slate-400">Class: {item.class_name || '-'}</p>
            <div className="mt-2 space-y-1">
              {(item.weekly_slots || []).map((slot, index) => (
                <p key={`${item.assignment_id}-${index}`} className="text-sm text-slate-300">
                  {slot.day.charAt(0).toUpperCase() + slot.day.slice(1)} | {slot.start_time} - {slot.end_time} | Room: {slot.room || '-'}
                </p>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function AssignCoursesPanel({ showToast }) {
  const [targetRole, setTargetRole] = useState('student')
  const [courseName, setCourseName] = useState('Math')
  const [className, setClassName] = useState('')
  const [studentTargetIds, setStudentTargetIds] = useState('')
  const [teacherTargetIds, setTeacherTargetIds] = useState('')
  const [targetIds, setTargetIds] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [slots, setSlots] = useState([{ day: 'monday', start_time: '09:00', end_time: '10:00', room: '' }])
  const [teachers, setTeachers] = useState([])
  const [studentsByClass, setStudentsByClass] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(false)
  const courseOptions = ['Math', 'Physics', 'Chemistry', 'Biology']

  useEffect(() => {
    const loadTeachers = async () => {
      try {
        const response = await fetchRegistrationList('teacher')
        setTeachers(response.items || [])
      } catch {
        setTeachers([])
      }
    }
    loadTeachers()
  }, [])

  useEffect(() => {
    const loadStudents = async () => {
      if (targetRole !== 'student' || !className) {
        setStudentsByClass([])
        return
      }
      setLoadingStudents(true)
      try {
        const response = await fetchStudentsByClass(className)
        setStudentsByClass(response.items || [])
      } catch {
        setStudentsByClass([])
      } finally {
        setLoadingStudents(false)
      }
    }

    loadStudents()
  }, [targetRole, className])

  const addStudentId = (studentId) => {
    const existingIds = studentTargetIds
      .split(/[\s,]+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value))

    if (existingIds.includes(studentId)) {
      return
    }

    setStudentTargetIds([...existingIds, studentId].join(', '))
  }

  const parseIds = (rawValue) => {
    return rawValue
      .split(/[\s,]+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((value) => Number.isInteger(value))
  }

  const updateSlot = (index, key, value) => {
    setSlots((prev) => prev.map((slot, idx) => (idx === index ? { ...slot, [key]: value } : slot)))
  }

  const addSlot = () => {
    setSlots((prev) => [...prev, { day: 'monday', start_time: '09:00', end_time: '10:00', room: '' }])
  }

  const removeSlot = (index) => {
    setSlots((prev) => prev.filter((_, idx) => idx !== index))
  }

  const submitAssignment = async () => {
    setSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      if (targetRole === 'student') {
        const studentIds = parseIds(studentTargetIds)
        const teacherIds = parseIds(teacherTargetIds)

        if (studentIds.length === 0) {
          throw new Error('Please enter at least one Student ID.')
        }
        if (teacherIds.length === 0) {
          throw new Error('Please enter at least one Teacher ID.')
        }

        const studentResponse = await assignCourse({
          target_role: 'student',
          course_name: courseName,
          class_name: className,
          target_user_ids: studentIds,
          notes,
          weekly_slots: slots,
        })

        const teacherResponse = await assignCourse({
          target_role: 'teacher',
          course_name: courseName,
          class_name: '',
          target_user_ids: teacherIds,
          notes,
          weekly_slots: slots,
        })

        setSuccessMessage(
          `Student assignments: ${studentResponse.count}, Teacher assignments: ${teacherResponse.count}`,
        )
      } else {
        const ids = parseIds(targetIds)
        const response = await assignCourse({
          target_role: targetRole,
          course_name: courseName,
          class_name: '',
          target_user_ids: ids,
          notes,
          weekly_slots: slots,
        })
        setSuccessMessage(`${response.message} Assigned records: ${response.count}`)
      }

      showToast('Course assigned successfully.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Course assignment failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Assign Courses</CardTitle>
        <CardDescription>Management can assign courses to students by class and ID, and to teachers by ID.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Target Role</label>
            <select className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" value={targetRole} onChange={(e) => setTargetRole(e.target.value)}>
              <option value="student">Student</option>
              <option value="teacher">Teacher</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Course Name</label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              value={courseName}
              onChange={(e) => setCourseName(e.target.value)}
            >
              {courseOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
          {targetRole === 'student' ? (
            <div>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Class Name</label>
              <select
                className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                value={className}
                onChange={(e) => setClassName(e.target.value)}
              >
                <option value="">Select class</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                  <option key={value} value={String(value)}>{value}</option>
                ))}
              </select>
            </div>
          ) : null}
          {targetRole === 'student' ? (
            <>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Student IDs (comma or space separated)</label>
                <Input value={studentTargetIds} onChange={(e) => setStudentTargetIds(e.target.value)} placeholder="1001, 1002" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Teacher IDs (comma or space separated)</label>
                <Input value={teacherTargetIds} onChange={(e) => setTeacherTargetIds(e.target.value)} placeholder="2001, 2002" />
              </div>
            </>
          ) : (
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Target IDs (comma or space separated)</label>
              <Input value={targetIds} onChange={(e) => setTargetIds(e.target.value)} placeholder="101, 102" />
            </div>
          )}
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional notes" />
          </div>
        </div>

        {targetRole === 'student' ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <p className="mb-2 text-sm font-medium text-slate-200">Teachers List (Name and ID)</p>
            <div className="max-h-40 space-y-2 overflow-auto">
              {teachers.map((teacher) => (
                <p key={teacher.user_id} className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                  {teacher.full_name || teacher.username} (ID: {teacher.user_id})
                </p>
              ))}
              {teachers.length === 0 ? <p className="text-sm text-slate-400">No teachers found.</p> : null}
            </div>
          </div>
        ) : null}

        {targetRole === 'student' ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <p className="mb-2 text-sm font-medium text-slate-200">Students in Selected Class (Class | ID | Name)</p>
            {!className ? <p className="text-sm text-slate-400">Select class to load students.</p> : null}
            {loadingStudents ? <p className="text-sm text-slate-400">Loading students...</p> : null}
            <div className="max-h-44 space-y-2 overflow-auto">
              {studentsByClass
                .filter((item) => item.class_name === className)
                .flatMap((item) => item.students || [])
                .map((student) => (
                  <button
                    key={student.user_id}
                    type="button"
                    onClick={() => addStudentId(student.user_id)}
                    className="block w-full rounded border border-slate-800 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 hover:border-slate-700"
                  >
                    {student.class_name} | {student.user_id} | {student.full_name || student.username}
                  </button>
                ))}
              {studentsByClass
                .filter((item) => item.class_name === className)
                .flatMap((item) => item.students || []).length === 0 && className && !loadingStudents ? (
                <p className="text-sm text-slate-400">No students found for class {className}.</p>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-400">Click a student row to append their ID into Student IDs.</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">Weekly Slots</p>
            <Button size="sm" variant="outline" onClick={addSlot}>Add Slot</Button>
          </div>
          {slots.map((slot, index) => (
            <div key={`slot-${index}`} className="grid grid-cols-1 gap-2 rounded-md border border-slate-800 bg-slate-900/60 p-2 md:grid-cols-5">
              <select className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" value={slot.day} onChange={(e) => updateSlot(index, 'day', e.target.value)}>
                <option value="monday">Monday</option>
                <option value="tuesday">Tuesday</option>
                <option value="wednesday">Wednesday</option>
                <option value="thursday">Thursday</option>
                <option value="friday">Friday</option>
                <option value="saturday">Saturday</option>
                <option value="sunday">Sunday</option>
              </select>
              <input type="time" className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" value={slot.start_time} onChange={(e) => updateSlot(index, 'start_time', e.target.value)} />
              <input type="time" className="h-10 rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100" value={slot.end_time} onChange={(e) => updateSlot(index, 'end_time', e.target.value)} />
              <Input value={slot.room} onChange={(e) => updateSlot(index, 'room', e.target.value)} placeholder="Room" />
              <Button variant="outline" size="sm" onClick={() => removeSlot(index)} disabled={slots.length === 1}>Remove</Button>
            </div>
          ))}
        </div>

        {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

        <Button onClick={submitAssignment} disabled={submitting}>
          {submitting ? 'Assigning...' : 'Assign Course'}
        </Button>
      </CardContent>
    </Card>
  )
}

function TeacherMarksPanel({ showToast }) {
  const [students, setStudents] = useState([])
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [marks, setMarks] = useState([])
  const [subject, setSubject] = useState('Math')
  const [submitting, setSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [form, setForm] = useState({
    ct_1: 0,
    ct_2: 0,
    ct_3: 0,
    ct_4: 0,
    ct_5: 0,
    ct_6: 0,
    ct_7: 0,
    ct_8: 0,
    term_1: 0,
    term_2: 0,
    model_1: 0,
    model_2: 0,
    model_3: 0,
  })

  const loadStudents = async () => {
    try {
      const response = await fetchTeacherStudents()
      setStudents(response.items || [])
      if (!selectedStudentId && response.items?.[0]?.user_id) {
        setSelectedStudentId(String(response.items[0].user_id))
      }
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  const loadMarks = async (studentId = selectedStudentId) => {
    if (!studentId) {
      setMarks([])
      return
    }
    try {
      const response = await fetchTeacherMarks(studentId)
      setMarks(response.items || [])
    } catch (error) {
      setErrorMessage(error.message)
    }
  }

  useEffect(() => {
    loadStudents()
  }, [])

  useEffect(() => {
    if (selectedStudentId) {
      loadMarks(selectedStudentId)
    }
  }, [selectedStudentId])

  const submitMarks = async () => {
    if (!selectedStudentId) {
      setErrorMessage('Select a student first.')
      return
    }
    setSubmitting(true)
    setErrorMessage('')
    try {
      await upsertTeacherMark({
        student_id: Number.parseInt(selectedStudentId, 10),
        subject,
        ...form,
      })
      await loadMarks(selectedStudentId)
      showToast('Marks saved.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Failed to save marks.')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedStudent = students.find((item) => String(item.user_id) === String(selectedStudentId))

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Teacher Marks Entry</CardTitle>
        <CardDescription>Enter marks for students assigned under your class domain.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <p className="mb-2 text-sm font-medium text-slate-200">Assigned Students (Class | ID | Name)</p>
          <div className="max-h-44 space-y-2 overflow-auto">
            {students.map((student) => (
              <button
                key={student.user_id}
                onClick={() => setSelectedStudentId(String(student.user_id))}
                className={`block w-full rounded-md border px-3 py-2 text-left text-sm ${
                  String(student.user_id) === String(selectedStudentId)
                    ? 'border-sky-500/50 bg-sky-500/10 text-sky-100'
                    : 'border-slate-800 bg-slate-900 text-slate-200'
                }`}
              >
                {student.class_name || '-'} | {student.user_id} | {student.full_name || student.username}
              </button>
            ))}
            {students.length === 0 ? <p className="text-sm text-slate-400">No students assigned yet.</p> : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Selected Student</label>
            <Input value={selectedStudent ? `${selectedStudent.full_name || selectedStudent.username} (${selectedStudent.user_id})` : ''} readOnly />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Class</label>
            <Input value={selectedStudent?.class_name || ''} readOnly />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Subject</label>
            <select
              className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              <option value="Math">Math</option>
              <option value="Physics">Physics</option>
              <option value="Chemistry">Chemistry</option>
              <option value="Biology">Biology</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Object.keys(form).map((key) => (
            <div key={key}>
              <label className="text-xs uppercase tracking-[0.18em] text-slate-400">{key}</label>
              <Input
                type="number"
                value={form[key]}
                onChange={(e) => setForm((prev) => ({ ...prev, [key]: Number.parseInt(e.target.value || '0', 10) }))}
              />
            </div>
          ))}
        </div>

        {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
        <Button onClick={submitMarks} disabled={submitting}>{submitting ? 'Saving...' : 'Save Marks'}</Button>

        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <p className="mb-2 text-sm font-medium text-slate-200">Saved Marks</p>
          {marks.length === 0 ? <p className="text-sm text-slate-400">No marks saved for selected student.</p> : null}
          {marks.map((item) => (
            <div key={item.id} className="mb-2 rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
              <p>{item.subject} | Class: {item.class_name}</p>
              <p className="text-xs text-slate-400">CT1-8: {item.ct_1}, {item.ct_2}, {item.ct_3}, {item.ct_4}, {item.ct_5}, {item.ct_6}, {item.ct_7}, {item.ct_8}</p>
              <p className="text-xs text-slate-400">Term1/2: {item.term_1}/{item.term_2} | Model1/2/3: {item.model_1}/{item.model_2}/{item.model_3}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function LibraryPanel({ user, showToast }) {
  const isManagement = user?.user_type === 3
  const isStudent = user?.user_type === 1
  const roleOptions = isStudent
    ? ['Books', 'Technical', 'Teacher', 'Probation', 'Others']
    : ['Books', 'Technical', 'Student', 'Special resources', 'Others']

  const [resourceType, setResourceType] = useState(roleOptions[0])
  const [explanation, setExplanation] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [items, setItems] = useState([])
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadItems = async () => {
    setLoading(true)
    setErrorMessage('')
    try {
      const response = await fetchLibraryApplications()
      setItems(response.items || [])
    } catch (error) {
      setErrorMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadItems()
  }, [])

  const submitApplication = async () => {
    setSubmitting(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const response = await submitLibraryApplication({
        resource_type: resourceType,
        explanation,
      })
      setSuccessMessage(response.message)
      setExplanation('')
      await loadItems()
      showToast('Library application submitted.')
    } catch (error) {
      setErrorMessage(error.message)
      showToast('Library application failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Card className="border-slate-800 bg-slate-950/80">
      <CardHeader>
        <CardTitle className="font-heading text-xl">Library & Resource Application</CardTitle>
        <CardDescription>
          Application process: fill in required resource type and a clear explanation. Your request will be recorded and reviewed by management.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!isManagement ? (
          <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Name (Auto)</label>
                <Input value={user?.name || ''} readOnly />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">ID (Auto)</label>
                <Input value={String(user?.user_id || '')} readOnly />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Resource Type</label>
                <select
                  className="mt-1 h-10 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
                  value={resourceType}
                  onChange={(e) => setResourceType(e.target.value)}
                >
                  {roleOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-[0.18em] text-slate-400">Explanation</label>
                <textarea
                  className="mt-1 min-h-32 w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Describe the resource need, purpose, urgency, and expected usage."
                />
              </div>
            </div>
            <div className="mt-3">
              <Button onClick={submitApplication} disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Application'}</Button>
            </div>
          </div>
        ) : null}

        {errorMessage ? <p className="text-sm text-rose-300">{errorMessage}</p> : null}
        {successMessage ? <p className="text-sm text-emerald-300">{successMessage}</p> : null}

        <div className="rounded-md border border-slate-800 bg-slate-900/60 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-slate-200">{isManagement ? 'All Applications (Management View)' : 'My Applications'}</p>
            <Button variant="outline" size="sm" onClick={loadItems} disabled={loading}>{loading ? 'Refreshing...' : 'Refresh'}</Button>
          </div>
          {items.length === 0 && !loading ? <p className="text-sm text-slate-400">No applications found.</p> : null}
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="rounded border border-slate-800 bg-slate-900 px-3 py-2 text-sm text-slate-200">
                <p className="font-medium">{item.resource_type}</p>
                <p className="text-xs text-slate-400">{item.requester_name} (ID: {item.requester_id}) - {item.requester_role}</p>
                <p className="mt-1 text-slate-300">{item.explanation}</p>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
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
              <button
                key={item}
                onClick={() => {
                  if (item === 'Registration') {
                    setActiveSection('Registration')
                  }
                  if (item === 'Grade Report') {
                    setActiveSection('Grade Reports')
                  }
                  if (item === 'Courses and Result') {
                    setActiveSection('Grade Reports')
                  }
                }}
                className="rounded-md px-3 py-2 text-sm text-slate-200 transition hover:bg-slate-800 hover:text-white"
              >
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
          {activeSection === 'Grade Reports' && (user?.user_type === 1 || user?.user_type === 3) ? <GradeReportPanel user={user} showToast={showToast} /> : null}
          {activeSection === 'Registration' && user?.user_type === 3 ? <RegistrationPanel showToast={showToast} /> : null}
          {activeSection === 'Weekly Schedule' && (user?.user_type === 1 || user?.user_type === 2) ? <WeeklySchedulePanel /> : null}
          {activeSection === 'Assign Courses' && user?.user_type === 3 ? <AssignCoursesPanel showToast={showToast} /> : null}
          {activeSection === 'Marks Entry' && user?.user_type === 2 ? <TeacherMarksPanel showToast={showToast} /> : null}
          {activeSection === 'Library' ? <LibraryPanel user={user} showToast={showToast} /> : null}

          {activeSection !== 'AI Help' && activeSection !== 'Grade Reports' && activeSection !== 'Registration' && activeSection !== 'Weekly Schedule' && activeSection !== 'Assign Courses' && activeSection !== 'Marks Entry' && activeSection !== 'Library' ? (
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
