// test-argv.mjs
// A simple script to show what process.argv contains

console.log('Full process.argv:')
console.log(process.argv)

console.log('\n--- Breaking it down: ---')
console.log('[0] Node executable:', process.argv[0])
console.log('[1] Script file:', process.argv[1])
console.log('[2] First argument:', process.argv[2])
console.log('[3] Second argument:', process.argv[3])

console.log('\n--- How many arguments? ---')
console.log('Total items:', process.argv.length)
console.log('User arguments only:', process.argv.length - 2, '(excluding Node and script path)')
