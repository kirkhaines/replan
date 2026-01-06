import { useEffect, useRef } from 'react'
import { useBeforeUnload } from 'react-router-dom'

const DEFAULT_MESSAGE = 'You have unsaved changes. Are you sure you want to leave this page?'

const useUnsavedChangesWarning = (when: boolean, message: string = DEFAULT_MESSAGE) => {
  const lastHashRef = useRef(window.location.hash)
  const ignoreNextRef = useRef(false)

  useBeforeUnload((event) => {
    if (!when) {
      return
    }
    event.preventDefault()
    event.returnValue = message
  })

  useEffect(() => {
    const handleHashChange = () => {
      const nextHash = window.location.hash
      if (ignoreNextRef.current) {
        ignoreNextRef.current = false
        lastHashRef.current = nextHash
        return
      }
      if (!when) {
        lastHashRef.current = nextHash
        return
      }
      if (nextHash === lastHashRef.current) {
        return
      }
      if (window.confirm(message)) {
        lastHashRef.current = nextHash
        return
      }
      ignoreNextRef.current = true
      window.location.hash = lastHashRef.current
    }

    window.addEventListener('hashchange', handleHashChange)
    const handleClick = (event: MouseEvent) => {
      if (!when || event.defaultPrevented) {
        return
      }
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      const anchor = target.closest('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) {
        return
      }
      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('mailto:') || href.startsWith('tel:')) {
        return
      }
      const nextUrl = new URL(anchor.href, window.location.href).href
      if (nextUrl === window.location.href) {
        return
      }
      if (window.confirm(message)) {
        ignoreNextRef.current = true
        return
      }
      event.preventDefault()
      event.stopImmediatePropagation()
    }

    window.addEventListener('click', handleClick, true)
    return () => {
      window.removeEventListener('hashchange', handleHashChange)
      window.removeEventListener('click', handleClick, true)
    }
  }, [message, when])
}

export default useUnsavedChangesWarning
