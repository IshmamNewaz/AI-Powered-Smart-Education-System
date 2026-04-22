const API_BASE = import.meta.env.VITE_API_BASE_URL || ''

async function apiFetch(path, options = {}) {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 45000)
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    signal: controller.signal,
    ...options,
  })
  window.clearTimeout(timeoutId)

  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : null

  if (!response.ok) {
    const message = payload?.error || 'Request failed.'
    throw new Error(message)
  }

  return payload
}

export function fetchSession() {
  return apiFetch('/api/session/', { method: 'GET' })
}

export function login(name, password) {
  return apiFetch('/api/login/', {
    method: 'POST',
    body: JSON.stringify({ name, password }),
  })
}

export function logout() {
  return apiFetch('/api/logout/', { method: 'POST', body: JSON.stringify({}) })
}

export function fetchDashboard() {
  return apiFetch('/api/dashboard/', { method: 'GET' })
}

export function fetchAiThreads() {
  return apiFetch('/api/ai/threads/', { method: 'GET' })
}

export function fetchAiThreadMessages(threadId) {
  return apiFetch(`/api/ai/threads/${threadId}/messages/`, { method: 'GET' })
}

export function sendAiMessage(message, threadId = null) {
  return apiFetch('/api/ai/chat/', {
    method: 'POST',
    body: JSON.stringify({ message, thread_id: threadId }),
  })
}

export function renameAiThread(threadId, title) {
  return apiFetch(`/api/ai/threads/${threadId}/rename/`, {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function deleteAiThread(threadId) {
  return apiFetch(`/api/ai/threads/${threadId}/delete/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export async function sendAiMessageStream(message, threadId, handlers = {}) {
  const response = await fetch(`${API_BASE}/api/ai/chat/stream/`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, thread_id: threadId }),
  })

  if (!response.ok) {
    const contentType = response.headers.get('content-type') || ''
    const payload = contentType.includes('application/json') ? await response.json() : null
    throw new Error(payload?.error || 'Request failed.')
  }

  if (!response.body) {
    throw new Error('Streaming is not supported in this browser.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) {
      const tail = buffer.trim()
      if (tail) {
        const event = JSON.parse(tail)
        if (event.type === 'done' && handlers.onDone) {
          handlers.onDone(event)
        }
        if (event.type === 'error') {
          throw new Error(event.error || 'Streaming failed.')
        }
      }
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) {
        continue
      }

      const event = JSON.parse(trimmed)
      if (event.type === 'thread' && handlers.onThread) {
        handlers.onThread(event.thread)
      }
      if (event.type === 'chunk' && handlers.onChunk) {
        handlers.onChunk(event.content)
      }
      if (event.type === 'done' && handlers.onDone) {
        handlers.onDone(event)
        try {
          await reader.cancel()
        } catch {
          // Ignore cancellation errors; UI state is already finalized.
        }
        return
      }
      if (event.type === 'error') {
        throw new Error(event.error || 'Streaming failed.')
      }
    }
  }
}

export function fetchGradeReport(mode = 'semester', studentId = null) {
  const params = new URLSearchParams({ mode })
  if (studentId) {
    params.set('student_id', String(studentId))
  }
  return apiFetch(`/api/grade-report/?${params.toString()}`, { method: 'GET' })
}

export function fetchGradeReportWithClass(mode = 'semester', studentId = null, className = '') {
  const params = new URLSearchParams({ mode })
  if (studentId) {
    params.set('student_id', String(studentId))
  }
  if (className) {
    params.set('class_name', className)
  }
  return apiFetch(`/api/grade-report/?${params.toString()}`, { method: 'GET' })
}

export function predictGradeReport(studentId, resultSheet) {
  return apiFetch('/api/grade-report/predict/', {
    method: 'POST',
    body: JSON.stringify({
      student_id: studentId,
      result_sheet: resultSheet,
    }),
  })
}

export function predictGradeReportWithClass(studentId, className, resultSheet) {
  return apiFetch('/api/grade-report/predict/', {
    method: 'POST',
    body: JSON.stringify({
      student_id: studentId,
      class_name: className,
      result_sheet: resultSheet,
    }),
  })
}

export function submitRegistration(role, payload, profilePhoto = null) {
  return submitRegistrationMultipart('/api/registration/submit/', role, payload, profilePhoto)
}

function submitRegistrationMultipart(path, role, payload, profilePhoto = null) {
  const formData = new FormData()
  formData.append('role', role)
  formData.append('payload', JSON.stringify(payload))
  if (profilePhoto) {
    formData.append('profile_photo', profilePhoto)
  }

  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    credentials: 'include',
    body: formData,
  }).then(async (response) => {
    const contentType = response.headers.get('content-type') || ''
    const payloadResponse = contentType.includes('application/json') ? await response.json() : null
    if (!response.ok) {
      throw new Error(payloadResponse?.error || 'Request failed.')
    }
    return payloadResponse
  })
}

export function fetchRegistrationList(role) {
  const params = new URLSearchParams()
  if (role) {
    params.set('role', role)
  }
  return apiFetch(`/api/registration/list/?${params.toString()}`, { method: 'GET' })
}

export function updateRegistration(profileId, role, payload, profilePhoto = null) {
  return submitRegistrationMultipart(`/api/registration/${profileId}/update/`, role, payload, profilePhoto)
}

export function deleteRegistration(profileId) {
  return apiFetch(`/api/registration/${profileId}/delete/`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function fetchWeeklySchedule() {
  return apiFetch('/api/schedule/weekly/', { method: 'GET' })
}

export function assignCourse(payload) {
  return apiFetch('/api/courses/assign/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchStudentsByClass(className = '') {
  const params = new URLSearchParams()
  if (className) {
    params.set('class_name', className)
  }
  return apiFetch(`/api/students/by-class/?${params.toString()}`, { method: 'GET' })
}

export function fetchTeacherStudents() {
  return apiFetch('/api/teacher/students/', { method: 'GET' })
}

export function fetchTeacherMarks(studentId = null) {
  const params = new URLSearchParams()
  if (studentId) {
    params.set('student_id', String(studentId))
  }
  return apiFetch(`/api/teacher/marks/?${params.toString()}`, { method: 'GET' })
}

export function upsertTeacherMark(payload) {
  return apiFetch('/api/teacher/marks/upsert/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function submitLibraryApplication(payload) {
  return apiFetch('/api/library/applications/submit/', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function fetchLibraryApplications() {
  return apiFetch('/api/library/applications/', { method: 'GET' })
}
