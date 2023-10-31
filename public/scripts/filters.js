import { fuzzySearchCharacters, fuzzySearchGroups, fuzzySearchWorldInfo, power_user } from "./power-user.js";
import { tag_map } from "./tags.js";

/**
 * The filter types.
 * @type {Object.<string, string>}
 */
export const FILTER_TYPES = {
    SEARCH: 'search',
    TAG: 'tag',
    FAV: 'fav',
    GROUP: 'group',
    WORLD_INFO_SEARCH: 'world_info_search',
};

/**
 * Helper class for filtering data.
 * @example
 * const filterHelper = new FilterHelper(() => console.log('data changed'));
 * filterHelper.setFilterData(FILTER_TYPES.SEARCH, 'test');
 * data = filterHelper.applyFilters(data);
 */
export class FilterHelper {
    /**
     * Creates a new FilterHelper
     * @param {Function} onDataChanged Callback to trigger when the filter data changes
     */
    constructor(onDataChanged) {
        this.onDataChanged = onDataChanged;
    }

    /**
     * The filter functions.
     * @type {Object.<string, Function>}
     */
    filterFunctions = {
        [FILTER_TYPES.SEARCH]: this.searchFilter.bind(this),
        [FILTER_TYPES.GROUP]: this.groupFilter.bind(this),
        [FILTER_TYPES.FAV]: this.favFilter.bind(this),
        [FILTER_TYPES.TAG]: this.tagFilter.bind(this),
        [FILTER_TYPES.WORLD_INFO_SEARCH]: this.wiSearchFilter.bind(this),
        hide_characters_present_in_deck: this.hideCharactersAlreadyInDeck.bind(this)

    }

    /**
     * The filter data.
     * @type {Object.<string, any>}
     */
    filterData = {
        [FILTER_TYPES.SEARCH]: '',
        [FILTER_TYPES.GROUP]: false,
        [FILTER_TYPES.FAV]: false,
        [FILTER_TYPES.TAG]: { excluded: [], selected: [] },
        [FILTER_TYPES.WORLD_INFO_SEARCH]: '',
    }

    hideCharactersAlreadyInDeck(data) {
        const decks = data.filter(item => 'deck' === item.type)
        const characterIds = [...new Set(decks.reduce((a, b) => a.concat(b.item.characters), []))];

        return data.filter(item => false === characterIds.includes(String(item.id)));
    }

    /**
     * Applies a fuzzy search filter to the World Info data.
     * @param {any[]} data The data to filter. Must have a uid property.
     * @returns {any[]} The filtered data.
     */
    wiSearchFilter(data) {
        const term = this.filterData[FILTER_TYPES.WORLD_INFO_SEARCH];

        if (!term) {
            return data;
        }

        const fuzzySearchResults = fuzzySearchWorldInfo(data, term);
        return data.filter(entity => fuzzySearchResults.includes(entity.uid));
    }

    /**
     * Applies a tag filter to the data.
     * @param {any[]} data The data to filter.
     * @returns {any[]} The filtered data.
     */
    tagFilter(data) {
        const TAG_LOGIC_AND = true; // switch to false to use OR logic for combining tags
        const { selected, excluded } = this.filterData[FILTER_TYPES.TAG];

        if (!selected.length && !excluded.length) {
            return data;
        }

        function isElementTagged(entity, tagId) {
            const isCharacter = entity.type === 'character';
            const lookupValue = isCharacter ? entity.item.avatar : String(entity.id);
            const isTagged = Array.isArray(tag_map[lookupValue]) && tag_map[lookupValue].includes(tagId);
            return isTagged;
        }

        function getIsTagged(entity) {
            const tagFlags = selected.map(tagId => isElementTagged(entity, tagId));
            const trueFlags = tagFlags.filter(x => x);
            const isTagged = TAG_LOGIC_AND ? tagFlags.length === trueFlags.length : trueFlags.length > 0;

            const excludedTagFlags = excluded.map(tagId => isElementTagged(entity, tagId));
            const isExcluded = excludedTagFlags.includes(true);

            if (isExcluded) {
                return false;
            } else if (selected.length > 0 && !isTagged) {
                return false;
            } else {
                return true;
            }
        }

        return data.filter(entity => getIsTagged(entity));
    }

    /**
     * Applies a favorite filter to the data.
     * @param {any[]} data The data to filter.
     * @returns {any[]} The filtered data.
     */
    favFilter(data) {
        if (!this.filterData[FILTER_TYPES.FAV]) {
            return data;
        }

        return data.filter(entity => entity.item.fav || entity.item.fav == "true");
    }

    /**
     * Applies a group type filter to the data.
     * @param {any[]} data The data to filter.
     * @returns {any[]} The filtered data.
     */
    groupFilter(data) {
        if (!this.filterData[FILTER_TYPES.GROUP]) {
            return data;
        }

        return data.filter(entity => entity.type === 'group');
    }

    /**
     * Applies a search filter to the data. Uses fuzzy search if enabled.
     * @param {any[]} data The data to filter.
     * @returns {any[]} The filtered data.
     */
    searchFilter(data) {
        if (!this.filterData[FILTER_TYPES.SEARCH]) {
            return data;
        }

        const searchValue = this.filterData[FILTER_TYPES.SEARCH].trim().toLowerCase();
        const fuzzySearchCharactersResults = power_user.fuzzy_search ? fuzzySearchCharacters(searchValue) : [];
        const fuzzySearchGroupsResults = power_user.fuzzy_search ? fuzzySearchGroups(searchValue) : [];

        function getIsValidSearch(entity) {
            const isGroup = entity.type === 'group';
            const isCharacter = entity.type === 'character';

            if (power_user.fuzzy_search) {
                if (isCharacter) {
                    return fuzzySearchCharactersResults.includes(parseInt(entity.id));
                } else if (isGroup) {
                    return fuzzySearchGroupsResults.includes(String(entity.id));
                } else {
                    return false;
                }
            }
            else {
                return entity.item?.name?.toLowerCase()?.includes(searchValue) || false;
            }
        }

        return data.filter(entity => getIsValidSearch(entity));
    }

    /**
     * Sets the filter data for the given filter type.
     * @param {string} filterType The filter type to set data for.
     * @param {any} data The data to set.
     * @param {boolean} suppressDataChanged Whether to suppress the data changed callback.
     */
    setFilterData(filterType, data, suppressDataChanged = false) {
        const oldData = this.filterData[filterType];
        this.filterData[filterType] = data;

        // only trigger a data change if the data actually changed
        if (JSON.stringify(oldData) !== JSON.stringify(data) && !suppressDataChanged) {
            this.onDataChanged();
        }
    }

    /**
     * Gets the filter data for the given filter type.
     * @param {string} filterType The filter type to get data for.
     */
    getFilterData(filterType) {
        return this.filterData[filterType];
    }

    /**
     * Applies all filters to the given data.
     * @param {any[]} data The data to filter.
     * @returns {any[]} The filtered data.
     */
    applyFilters(data) {
        return Object.values(this.filterFunctions)
            .reduce((data, fn) => fn(data), data);
    }
}
