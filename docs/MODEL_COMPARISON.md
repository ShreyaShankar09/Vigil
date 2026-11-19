# Model comparison status

This document records the comparison evidence available in the repository. It does not
invent head-to-head results.

## Available measurements

The current committed model is the calibrated `small_cnn` TFLite baseline. Its synthetic
test measurements are generated from
`narcotrace-backend/app/ml/models/model_card.json` and summarized in
[EVALUATION.md](./EVALUATION.md). They are not real-photo or field-performance estimates.

## Missing comparisons

The requested common-split comparison of `small_cnn`, `mobilenetv3_small`, and `lab_nn`,
automatic validation-set selection, complete run artifact registry, and comparison
metrics generator are not present in the current training pipeline. The committed model
card has no metrics for the additional candidates, so there is no defensible accuracy table
or selected-model claim to publish here.

Before selecting another model, implement the same-session split and evaluation pipeline,
compare card-found validation accuracy for selection, and report test results once from the
locked test split. Never compare one model's validation score with another model's test
score.

## Release status

The deployed classifier remains **SYNTHETIC BASELINE**. No real, lab-confirmed evaluation
is available; do not promote the model for operational evidentiary use.
