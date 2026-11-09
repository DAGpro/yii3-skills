Configure mutation testing for this project using Infection:
1. Install infection/infection and roave/infection-static-analysis-plugin as development dependencies.
2. Enable the infection/extension-installer plugin in composer.json (config -> allow-plugins).
3. Create the canonical infection.json.dist configuration file targeting src/ with @default mutators and standard text logging.
4. Add an infection script in composer.json with an MSI threshold (--min-msi=80).
