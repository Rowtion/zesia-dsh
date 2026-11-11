# UIArc host adaptation

Source: https://github.com/kuratlielia/arc-library (https://uiarc.dev), MIT.
Button CSS and RadioGroup CSS/markup are reused from the reviewed UIArc sources already installed in the Zesia repository. Full license: LICENSE.

This independent plugin keeps local copies, not runtime imports from another app. React is supplied by dsh. Motion-only label transitions and the travelling selection highlight are omitted; native controls retain keyboard interaction. The existing native modal keeps focus trapping, Escape and top-layer behavior. Component tokens are scoped to the settings dialog and mapped to dsh theme variables. No global theme variables are overwritten.
