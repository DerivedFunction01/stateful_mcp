-- ==========================================
-- 1. GLOBAL INFRASTRUCTURE & DIMENSION TABLES
-- ==========================================
CREATE TABLE 
  jurisdictions (
    jurisdiction_id SERIAL PRIMARY KEY, 
    jurisdiction_code VARCHAR(10) NOT NULL UNIQUE, 
    -- 'US-NY', 'GB-ENG', 'JP'
    region_name VARCHAR(100) NOT NULL
  ); 
CREATE TABLE 
  facilities (
    facility_id SERIAL PRIMARY KEY, 
    facility_code VARCHAR(50) NOT NULL UNIQUE, 
    -- 'HOSPITAL_A', 'CLINIC_B'
    facility_name VARCHAR(150) NOT NULL
  ); 
CREATE TABLE 
  specialties (
    specialty_id SERIAL PRIMARY KEY, 
    specialty_name VARCHAR(100) NOT NULL UNIQUE 
    -- 'Cardiology', 'Ophthalmology'
    ); 
CREATE TABLE 
  personnel (
    personnel_id SERIAL PRIMARY KEY, 
    personnel_description TEXT, 
    auth_provider_uid VARCHAR(100) NOT NULL UNIQUE 
    -- Links to system OAuth/IAM ID
    ); 
-- ==========================================
-- 2. CANONCIAL CORE CONCEPTS
-- ==========================================
CREATE TABLE 
  concept_namespaces (
    namespace_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    standard_type VARCHAR(50) NOT NULL, 
    -- 'SNOMED', 'ICD-10', 'LOINC', 'FHIR', 'CUSTOM'
    public_standard BOOLEAN DEFAULT TRUE, 
    -- True = Public, False = Private/Internal
    is_external_private BOOLEAN DEFAULT FALSE, 
    -- Isolates imported external custom schemas
    external_private_source VARCHAR(100), 
    -- Identifies the originating tenant (e.g., 'HOSPITAL_A')
    about TEXT, 
    link VARCHAR(500), 
    -- API ENDPOINT: Production ready API to return the concept display string or metadata given a code
    -- Ex: example.com/resolve?code={code}
    api_url VARCHAR(8192), 
    -- Supports dynamic query construction with parameter placeholders (e.g., '{code}') for flexible API integrations
    api_url_params JSONB, 
    -- A payload of data being sent the API for processing
    api_request_body JSONB, 
    -- Captures the specific path within the API response body where the display string can be found (e.g. 'abc.results[0].text')
    api_response_display_path VARCHAR(500), 
    created_at TIMESTAMP 
    WITH 
      TIME ZONE DEFAULT NOW(), 
      -- Constraint ensures a specific vocabulary authority vector is logged exactly once
      CONSTRAINT uq_namespace_authority UNIQUE (
        standard_type, is_external_private, 
        external_private_source
      )
  ); 
CREATE TABLE 
  canonical_concepts (
    concept_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    namespace_id UUID NOT NULL REFERENCES concept_namespaces(namespace_id) ON DELETE RESTRICT, 
    standard_code VARCHAR(100) NOT NULL, 
    -- The unchanging numeric code coordinate (e.g., 'R06.02')
    display VARCHAR(150) NOT NULL, 
    -- Official fallback string definition at this timestamp
    concept_date_designation TIMESTAMP 
    WITH 
      TIME ZONE DEFAULT NOW(), 
      -- Captures semantic mapping adjustments
      -- Composite unique key tracks semantic code drift dynamically over time within its authority space
      CONSTRAINT uq_versioned_concept UNIQUE (
        namespace_id, standard_code, concept_date_designation
      )
  ); 
CREATE INDEX 
  idx_concepts_traversal_speed ON canonical_concepts (
    namespace_id, standard_code, concept_date_designation DESC
  ); CREATE TYPE concept_translator_relation ENUM (
  'EQUIVALENT', 'NARROWER_THAN', 'WIDER_THAN'
); 
CREATE TABLE 
  concept_translator (
    link_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    concept_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    linked_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    -- 'EQUIVALENT', 'NARROWER_THAN', 'WIDER_THAN'
    relationship_type concept_translator_relation NOT NULL DEFAULT 'EQUIVALENT', 
    active BOOLEAN DEFAULT TRUE, 
    -- Track exactly when this mapping consensus became valid
    mapping_date_designation TIMESTAMP 
    WITH 
      TIME ZONE DEFAULT NOW(), 
      CONSTRAINT chk_prevent_self_loop CHECK (concept_id <> linked_id), 
      -- Prevent exact duplicate mapping assertions within the same point in time
      UNIQUE(
        concept_id, linked_id, relationship_type, 
        mapping_date_designation
      )
  ); 
CREATE INDEX 
  idx_concept_translator_temporal ON concept_translator (
    concept_id, mapping_date_designation, 
    active
  ); 
CREATE TABLE 
  concept_translator_cache (
    cache_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    -- The starting anchor node (e.g., Your proprietary custom code)
    ancestor_concept_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    -- The terminal reachable node (e.g., A global SNOMED or ICD-10 standard code)
    descendant_concept_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    -- 1 = Direct link, 2 = Parent-to-Grandchild link, 3 = Great-Grandchild, etc.
    link_depth INTEGER NOT NULL CHECK (link_depth >= 1), 
    -- Inherited structural logic path tracking from the path chain
    -- e.g., If any link in the path is 'NARROWER_THAN', the global traversal classification updates
    inferred_relationship_type concept_translator_relation NOT NULL DEFAULT 'EQUIVALENT', 
    -- Mirroring the point in time this entire computed track matrix matches validation rules
    mapping_date_designation TIMESTAMP 
    WITH 
      TIME ZONE NOT NULL, 
      active BOOLEAN DEFAULT TRUE, 
      -- Enforce uniqueness of a specific path vector instance at a single coordinate in time
      UNIQUE(
        ancestor_concept_id, descendant_concept_id, 
        inferred_relationship_type, mapping_date_designation
      )
  ); 
-- Compound index optimized for immediate inheritance evaluation during a backward ledger step
CREATE INDEX 
  idx_concept_cache_traversal ON concept_translator_cache (
    ancestor_concept_id, mapping_date_designation, 
    active
  ) INCLUDE (
    descendant_concept_id, link_depth, 
    inferred_relationship_type
  ); 
CREATE TABLE 
  concept_display_registry (
    display_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    concept_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    -- ISO 639-1 or RFC 5646 codes (e.g., 'en', 'en-US', 'ja', 'es-MX')
    language_code VARCHAR(10) NOT NULL DEFAULT 'en', 
    -- The target human-readable string projection
    display_string TEXT NOT NULL, 
    -- Toggle True/False during usage instead of hardcoding inside display string
    reference_standard BOOLEAN DEFAULT FALSE, 
    reference_code BOOLEAN DEFAULT FALSE, 
    -- Architecture Layering: Allows for system defaults vs custom localized variants
    scope_tier VARCHAR(30) NOT NULL DEFAULT 'GLOBAL', 
    -- 'GLOBAL', 'CUSTOM_1', 'FACILITY', etc
    -- Priority weighting for localized string lookups when multiple matches exist
    preference_weight INTEGER DEFAULT 1, 
    active BOOLEAN DEFAULT TRUE
  ); 
-- ==========================================
-- 3. JURISDICTIONAL INTERSECTION
-- ==========================================
CREATE TABLE 
  concept_jurisdictional_displays (
    display_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    concept_id UUID REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    jurisdiction_id INTEGER REFERENCES jurisdictions(jurisdiction_id), 
    preferred_display TEXT NOT NULL, 
    fully_specified_name TEXT NOT NULL, 
    UNIQUE(concept_id, jurisdiction_id)
  ); 
-- ==========================================
-- 4. CDSL EXPRESSIONS & PARSER CONFIG
-- ==========================================
CREATE TYPE expression_target_assignment AS ENUM (
  'MAIN_TERM', 'ATTRIBUTE_MODIFIER', 
  'BOTH'
); 
CREATE TABLE 
  custom_expressions (
    expression_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    personnel_id INTEGER REFERENCES personnel(personnel_id), 
    expression_name VARCHAR(100) NOT NULL, 
    -- 'SOB', 'usual air problem', 'progressive'
    regex_pattern TEXT NOT NULL, 
    -- Engine regex pattern. Should not encode numerical values
    is_case_insensitive BOOLEAN DEFAULT TRUE, 
    -- Crucial Split: Tells the parser exactly where to route this token in the schema
    -- 'MAIN_TERM': maps to observation/vitals concept node
    -- 'ATTRIBUTE_MODIFIER': maps to trajectory, qualifiers, etc
    -- 'BOTH': is a MAIN_TERM only when no other MAIN_TERMS exist, else it is an ATTRIBUTE
    target_assignment expression_target_assignment NOT NULL DEFAULT 'MAIN_TERM', 
    concept_id UUID REFERENCES canonical_concepts(concept_id), 
    facility_id INTEGER REFERENCES facilities(facility_id), 
    specialty_id INTEGER REFERENCES specialties(specialty_id), 
    priority_weight INTEGER DEFAULT 1, 
    active BOOLEAN DEFAULT TRUE, 
    created_at TIMESTAMP 
    WITH 
      TIME ZONE DEFAULT NOW()
  ); 
CREATE INDEX 
  idx_expressions_parser_route ON custom_expressions (
    expression_name, target_assignment, 
    active
  ); 
-- ==========================================
-- 5. THE SYSTEM TAGGING MATRIX
-- ==========================================
CREATE TABLE 
  expression_tags (
    tag_id VARCHAR(50) PRIMARY KEY, 
    -- 'anatomy', 'symptom', 'drug'
    description TEXT
  ); 
CREATE TABLE 
  expression_tag_matrix (
    expression_id UUID REFERENCES custom_expressions(expression_id) ON DELETE CASCADE, 
    tag_id VARCHAR(50) REFERENCES expression_tags(tag_id), 
    PRIMARY KEY (expression_id, tag_id)
  ); 
-- ==========================================
-- 6. HISTORY TRACKING
-- ==========================================
CREATE TABLE 
  expression_resolution_counters (
    counter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(), 
    expression_id UUID NOT NULL REFERENCES custom_expressions(expression_id) ON DELETE CASCADE, 
    concept_id UUID NOT NULL REFERENCES canonical_concepts(concept_id) ON DELETE CASCADE, 
    -- Hierarchical Context Routing Tiers (Nullable to allow fallback resolution profiling)
    facility_id INTEGER REFERENCES facilities(facility_id) ON DELETE 
    SET 
      NULL, 
      specialty_id INTEGER REFERENCES specialties(specialty_id) ON DELETE 
    SET 
      NULL, 
      personnel_id INTEGER REFERENCES personnel(personnel_id) ON DELETE 
    SET 
      NULL, 
      -- The Atomic Accumulator
      usage_count BIGINT NOT NULL DEFAULT 0 CHECK (usage_count >= 0), 
      -- Tracking the lifecycle of the expression trend
      last_resolved_at TIMESTAMP 
    WITH 
      TIME ZONE DEFAULT NOW(), 
      -- Unique composite coordinate matrix ensures one tracking row per unique context intersection
      CONSTRAINT uq_resolution_context_metric UNIQUE(
        expression_id, concept_id, facility_id, 
        specialty_id, personnel_id
      )
  ); 
-- Indexing optimized for the context-autocomplete engine to grab the top-weighted suggestions instantly
CREATE INDEX 
  idx_resolution_weights_speed ON expression_resolution_counters (
    expression_id, specialty_id, facility_id, 
    usage_count DESC
  ) INCLUDE (concept_id); 