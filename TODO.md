# TODO List for Logic System Simulator


## High priority

 * Support touch events
 * Unify click-and-drag also from left buttons instead of click-and-move
 * ...


## Medium priority

 * Add contextual menu


## Low priority

 * Insert midpoints for wires to route them better
 * ...


### DONE

 * Refactor component hierarachy, in-memory list and JSON repr
 * Extract common stuff into Component superclass
 * Align input and output nodes on grid
 * Connect components with Shift key for overlapping nodes
 * Make 'esc' cancel item placement (wire or component)
 * Allow forcing output nodes to a predefined value
 * Allow inputs to be undetermined ('?')
 * Allow gates to be drawn in an undetermined shape
 * Change cursor depending on possible interaction
 * Validate JSON when loaded, define JSON types in a smart way
 * Allow changing modes, add admin mode to force nodes in states
 * Generate links or Markdown blocks with given diagram
 * Optimize draw calls