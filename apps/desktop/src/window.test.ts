import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({}))

const { isExternalLink, sameOrigin, trustedSender } = await import('./window')
const { remainingShow } = await import('./splash')

describe('window link rules', () => {
  const origin = 'http://127.0.0.1:7410'

  it('keeps only our own origin in the window', () => {
    expect(sameOrigin('http://127.0.0.1:7410/app/jobs', origin)).toBe(true)
    expect(sameOrigin('http://localhost:7410/app', origin)).toBe(false)
    expect(sameOrigin('http://127.0.0.1:7400/app', origin)).toBe(false)
    expect(sameOrigin('not a url', origin)).toBe(false)
  })

  it('opens only web and mail links externally', () => {
    expect(isExternalLink('https://github.com')).toBe(true)
    expect(isExternalLink('mailto:a@b.c')).toBe(true)
    expect(isExternalLink('file:///C:/Windows/system32/calc.exe')).toBe(false)
    expect(isExternalLink('javascript:alert(1)')).toBe(false)
  })
})

describe('who receives the desktop credentials', () => {
  const origin = 'http://127.0.0.1:7410'
  const mainFrame = { url: `${origin}/app` }
  const contents = { mainFrame }

  it('hands them to the main frame of our own window on our own origin', () => {
    expect(trustedSender({ sender: contents, senderFrame: mainFrame }, contents, origin)).toBe(true)
  })

  it('refuses a subframe, even one served from our own origin', () => {
    const iframe = { url: `${origin}/embedded` }
    expect(trustedSender({ sender: contents, senderFrame: iframe }, contents, origin)).toBe(false)
  })

  it('refuses another window, a foreign origin, and a frame already gone', () => {
    const other = { mainFrame: { url: `${origin}/app` } }
    expect(trustedSender({ sender: other, senderFrame: other.mainFrame }, contents, origin)).toBe(false)
    const foreign = { url: 'https://evil.test/' }
    expect(trustedSender({ sender: contents, senderFrame: foreign }, { mainFrame: foreign }, origin)).toBe(false)
    expect(trustedSender({ sender: contents, senderFrame: null }, contents, origin)).toBe(false)
  })
})

describe('splash minimum show time', () => {
  it('waits out the rest of 600 ms, and nothing once it has passed', () => {
    expect(remainingShow(1000, 1200)).toBe(400)
    expect(remainingShow(1000, 1700)).toBe(0)
    expect(remainingShow(null, 5000)).toBe(600)
  })
})
