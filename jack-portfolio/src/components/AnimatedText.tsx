import { motion, useScroll, useTransform, type MotionValue } from 'framer-motion'
import { useRef } from 'react'

type AnimatedTextProps = {
  text: string
  className?: string
}

function AnimatedChar({
  char,
  progress,
  index,
  total,
}: {
  char: string
  progress: MotionValue<number>
  index: number
  total: number
}) {
  const start = index / total
  const end = (index + 1) / total
  const opacity = useTransform(progress, [start, end], [0.2, 1])
  const isSpace = char === ' '

  return (
    <span className={isSpace ? 'relative' : 'relative inline-block'}>
      <span className="invisible">{isSpace ? ' ' : char}</span>
      <motion.span className="absolute left-0 top-0" style={{ opacity }}>
        {isSpace ? ' ' : char}
      </motion.span>
    </span>
  )
}

export function AnimatedText({ text, className }: AnimatedTextProps) {
  const ref = useRef<HTMLParagraphElement>(null)
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start 0.8', 'end 0.2'],
  })
  const chars = Array.from(text)
  const words = text.split(' ')
  let globalIndex = 0

  return (
    <p ref={ref} className={className} aria-label={text}>
      {words.map((word, wordIndex) => {
        const wordChars = Array.from(word)
        const startIndex = globalIndex
        globalIndex += wordChars.length + (wordIndex < words.length - 1 ? 1 : 0)

        return (
          <span key={`word-${wordIndex}`}>
            <span className="whitespace-nowrap">
              {wordChars.map((char, charIndex) => (
                <AnimatedChar
                  key={`${startIndex + charIndex}-${char}`}
                  char={char}
                  progress={scrollYProgress}
                  index={startIndex + charIndex}
                  total={chars.length}
                />
              ))}
            </span>
            {wordIndex < words.length - 1 ? (
              <AnimatedChar
                char=" "
                progress={scrollYProgress}
                index={startIndex + wordChars.length}
                total={chars.length}
              />
            ) : null}
          </span>
        )
      })}
    </p>
  )
}
