# Logic Circuit Simulator

A logic circuit simulator useful for educational use.

This is a fork followed by an almost complete rewrite of [drendog's Logic-Circuit-Simuator](https://github.com/drendog/Logic-Circuit-Simulator).


## Demo

See <https://jp.pellet.name/hep/logiga/>


## Development

 * Checkout with git
 * `npm install`
 * Open VS Code and open folder
 * `npm run compile-watch` to run the TypeScript compiler (without output) to check for errors
 * `npm run lint-watch` to run `eslint` to check for linting errors
 * `npm run bundle-watch` to build the bundle with `esbuild` (can be done on every save because `esbuild` is so fast)
 * `npm run server` to serve locally for testing on port 8088


## Differences with Original Version

 * This fork is completely written in TypeScript
 * Based on web components so that it can easily be embedded by pulling in a single JS file
 * Dependency on p5 was removed
 * Interface is drawn differently, all with canvas calls and no external images
 * Screen is only refreshed when needed and not 60 times per second no matter what
 * Clocks can be paused
 * Components have been added: bit display, segment display, nibble display, half adder, muxes, register, RAM, counter, various decoders, etc.
 * Size of components (in terms of number of bits) can be changed
 * RAM/ROM contents can be loaded from files
 * Mouseover tooltips have been added
 * Components can be edited to be faulty, for educational exercises
 * Editor can be in several modes with different capabilities
 * Editor can zoom and pan with standard controls (touch, trackpad, mouse wheel, etc.)
 * Component buttons can be hidden or shown for educational purposes with URL parameters
 * Loading and saving using JSON is much cleaner and does not include unnecessary properties
 * Demo circuits are predefined and can be loaded from the JavaScript console
 * Circuits can be loaded from a JSON export by drag-n-drop
 * An animated propagation delay can be set
 * Custom components can be created, loaded, saved from library files
 * Tests for a given circuit can be defined (or automatically generated) and run
 * UI can be in English or French (easy to add more translations)
 * Much more


## License

[MIT License](https://choosealicense.com/licenses/mit/)
