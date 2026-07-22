-- SQL Database Schema mapping to @stateful-mcp/clinical backend stores
-- Suitable for PostgreSQL (uses UUIDs and JSONB for flexible properties)

-- 1. Administrative Store Tables
CREATE TABLE facilities (
    facility_id VARCHAR(50) PRIMARY KEY,
    name TEXT NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb
);

CREATE TABLE personnel (
    personnel_id VARCHAR(50) PRIMARY KEY,
    facility_id VARCHAR(50) REFERENCES facilities(facility_id),
    username VARCHAR(100) UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    role VARCHAR(50) NOT NULL
);

-- 2. Parser Syntax Profile Storage
CREATE TABLE parser_syntax_profiles (
    profile_id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) REFERENCES personnel(personnel_id),
    tag_token VARCHAR(5) DEFAULT '#',
    state_delimiter VARCHAR(5) DEFAULT '||',
    state_start_delimiter VARCHAR(5) DEFAULT '|',
    state_end_delimiter VARCHAR(5) DEFAULT '|',
    comment_start_token VARCHAR(5) DEFAULT '//',
    comment_end_token VARCHAR(5) DEFAULT ';',
    macro_start_token VARCHAR(5) DEFAULT '^',
    macro_placeholder VARCHAR(5) DEFAULT '[__]',
    variable_start_token VARCHAR(5) DEFAULT '{',
    variable_end_token VARCHAR(5) DEFAULT '}',
    variable_delimiter VARCHAR(5) DEFAULT ',',
    start_term_code_delimiter VARCHAR(5) DEFAULT '@@',
    start_term_display_delimiter VARCHAR(5) DEFAULT '@#',
    start_term_code_separator VARCHAR(5) DEFAULT '#',
    start_term_delimiter VARCHAR(5) DEFAULT '@',
    end_term_delimiter VARCHAR(5) DEFAULT ';',
    attribute_delimiter VARCHAR(5) DEFAULT ',',
    term_tokenizer VARCHAR(5) DEFAULT '::',
    is_default BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE
);

-- Tag Mappings for Zero-Bias i18n
CREATE TABLE parser_tag_mappings (
    profile_id VARCHAR(50) REFERENCES parser_syntax_profiles(profile_id) ON DELETE CASCADE,
    tag_key VARCHAR(50) NOT NULL,
    target_schema VARCHAR(100) NOT NULL,
    PRIMARY KEY (profile_id, tag_key)
);

-- Prioritized namespaces for each schema mapping
CREATE TABLE parser_schema_namespaces (
    profile_id VARCHAR(50) REFERENCES parser_syntax_profiles(profile_id) ON DELETE CASCADE,
    schema_key VARCHAR(100) NOT NULL,
    namespace_code VARCHAR(50) NOT NULL,
    priority INT DEFAULT 0,
    PRIMARY KEY (profile_id, schema_key, namespace_code)
);

-- 3. Dynamic Parser Rules (Attribute Rules & Evaluators)
CREATE TABLE parser_attribute_rules (
    rule_id VARCHAR(50) PRIMARY KEY,
    profile_id VARCHAR(50) REFERENCES parser_syntax_profiles(profile_id) ON DELETE CASCADE,
    target_field VARCHAR(50) NOT NULL, -- e.g. 'certainty', 'status', 'severity', 'route'
    target_value VARCHAR(100) NOT NULL, -- e.g. 'refuted', 'severe'
    is_case_insensitive BOOLEAN DEFAULT TRUE
);

CREATE TABLE parser_attribute_rule_patterns (
    rule_id VARCHAR(50) REFERENCES parser_attribute_rules(rule_id) ON DELETE CASCADE,
    regex_pattern TEXT NOT NULL,
    PRIMARY KEY (rule_id, regex_pattern)
);

CREATE TABLE parser_dictionary_rules (
    rule_id VARCHAR(50) PRIMARY KEY,
    profile_id VARCHAR(50) REFERENCES parser_syntax_profiles(profile_id) ON DELETE CASCADE,
    target_field VARCHAR(50) NOT NULL, -- e.g. 'blood_pressure', 'quantity', 'severityScore'
    evaluator_name VARCHAR(100) NOT NULL -- e.g. 'parseBloodPressure', 'parseQuantityUnit'
);

CREATE TABLE parser_dictionary_rule_patterns (
    rule_id VARCHAR(50) REFERENCES parser_dictionary_rules(rule_id) ON DELETE CASCADE,
    regex_pattern TEXT NOT NULL,
    PRIMARY KEY (rule_id, regex_pattern)
);

-- 4. Concept Defaults Store (Anchoring Defaults)
CREATE TABLE parser_concept_defaults (
    anchor_concept_id VARCHAR(100) NOT NULL, -- e.g. 'LOINC::8310-5'
    target_schema VARCHAR(100) NOT NULL,    -- e.g. 'VitalsMeasurementEvent'
    default_properties JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. { "unit": "Cel" }
    PRIMARY KEY (anchor_concept_id, target_schema)
);

CREATE TABLE parser_concept_default_patterns (
    anchor_concept_id VARCHAR(100) NOT NULL,
    target_schema VARCHAR(100) NOT NULL,
    regex_pattern TEXT NOT NULL,
    FOREIGN KEY (anchor_concept_id, target_schema) REFERENCES parser_concept_defaults(anchor_concept_id, target_schema) ON DELETE CASCADE,
    PRIMARY KEY (anchor_concept_id, target_schema, regex_pattern)
);

-- 5. Calibration (Auditing & Slang Exception Log)
CREATE TABLE calibration_exceptions (
    exception_id BIGSERIAL PRIMARY KEY,
    raw_token TEXT NOT NULL,
    resolved_concept_id VARCHAR(100),
    context_sentence TEXT,
    is_reviewed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Stop Word Profiles
CREATE TABLE stop_word_profiles (
    profile_id VARCHAR(50) PRIMARY KEY,
    personnel_id VARCHAR(50) REFERENCES personnel(personnel_id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL
);

CREATE TABLE stop_words (
    profile_id VARCHAR(50) REFERENCES stop_word_profiles(profile_id) ON DELETE CASCADE,
    word VARCHAR(50) NOT NULL,
    PRIMARY KEY (profile_id, word)
);

-- 7. Clinical Prose Templates
CREATE TABLE clinical_prose_templates (
    template_id VARCHAR(50) PRIMARY KEY,
    schema_type VARCHAR(100) NOT NULL,
    prose_format TEXT NOT NULL,
    locale VARCHAR(10) DEFAULT 'en'
);

-- 8. Signed SOAP Notes Archive (Read-Only)
CREATE TABLE signed_soap_notes (
    note_id VARCHAR(50) PRIMARY KEY,
    encounter_id VARCHAR(50) NOT NULL,
    patient_id VARCHAR(50) NOT NULL,
    subjective_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    objective_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    assessment_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    plan_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature_author TEXT NOT NULL,
    signature_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    cryptographic_hash TEXT NOT NULL
);

-- 9. Jurisdictional Preferred Display Names
CREATE TABLE jurisdictional_displays (
    concept_id VARCHAR(100) NOT NULL,
    jurisdiction_code VARCHAR(10) NOT NULL,
    preferred_display TEXT NOT NULL,
    PRIMARY KEY (concept_id, jurisdiction_code)
);
