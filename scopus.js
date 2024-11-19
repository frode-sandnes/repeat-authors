"use strict"

// Variables specific to the scopus labels used
const SCOPUS_CITATIONS = "Cited by";
const SCOPUS_YEAR = "Year";
const SCOPUS_AUTHOR = "Authors";
const SCOPUS_AUTHOR_ID = "Author(s) ID"; // digit - delimiter;
const SCOPUS_AFFILIATIONS = "Authors with affiliations"; // country last,  - delimiter;  Using this instead of affiliations, as each author is listed. Makes it easier to connect
const SCOPUS_AUTHOR_FULLNAME = "Author full names";
const SCOPUS_TITLE = "Title";
const SCOPUS_REFERENCE = "References";
const SCOPUS_SOURCE = "Source title";
const SCOPUS_DOCUMENT_TYPE = "Document Type";
const SCOPUS_CONFERENCE = "Conference paper";
const SCOPUS_AUTHOR_KEYWORDS = "Author Keywords";
const SCOPUS_INDEX_KEYWORDS = "Index Keywords";
const SCOPUS_ARTICLE = "Article";
const SCOPUS_EDITORS = "Editors";
let SCOPUS_AUTHOR_DELIMINATOR = ",";
let SCOPUS_REFERENCE_DELIMINATOR = ";";

// globals
let conferences = {};
let authorShort = {};
let authorFull = {};
let authorAffiliation = {};
let paperFrequency = {};
let authorConferences = {}; // object with conference array for post analysis 
let authorPosition = {};    // list of positions for each author, as list - 1 = first, 2 = middle, 3 = last.
let fileCounter = 0;
let masterList = [];  // list of all the papers for all the conferences for easy reference (similarity)
// aggregated
let authorNumberConferences = {};

//extras - for specific analyses
let editorPapers = [];
let papStats = [];
let gatekeeperHistogram = [];   // Aggregated histograms of editors' paper frequency within each conference
let gatekeepers = new Set();
let citations = {};         // for citation analyis

// Bootstrapping
window.addEventListener('DOMContentLoaded', (event) => setup());
function setup()
    {
    // Add file load handler
    const fileSelector = document.getElementById("file-selector");
	fileSelector.addEventListener('change', (event) => loadFile(event));        
    }
// retrieving file contents in excel format	as JSON object
function loadFile(event)
    {
    const files = event.target.files;

    for (var i = 0, f; f = files[i]; i++) 
        {			
        var reader = new FileReader();

        let {name} = f;

        reader.onload = (function(theFile) 
            {
            return function(e) 
                {
// new fixes due to the deprecation of readAsBinaryString                    
                var data = new Uint8Array(e.target.result);
                var workbook = XLSX.read(data, {type: 'array'});                    
//                var workbook = XLSX.read(e.target.result, {type: 'binary'});	
                for (var sheetName of workbook.SheetNames)
                    {
                    let json = XLSX.utils.sheet_to_row_object_array(workbook.Sheets[sheetName]);
                    conferences[name] = json;
                    }
                // we have loaded everything - start procesing
                if (++fileCounter >= files.length)
                    {
                    runAnalysis();
                    hide("configuration");
                    show("finished");
                    }
                };
            })(f);		
   //     reader.readAsBinaryString(f);
        reader.readAsArrayBuffer(f);
// info her
//https://github.com/SheetJS/sheetjs/issues/2295


        }
    }

function diversity(author) // based on sum
    {
    let sum = 0;
    let confHist = Object.groupBy(authorConferences[author], (e => e));
    Object.keys(confHist)
        .filter(key => confHist[key].length > 1)    // just count conferences with more than one paper
        .forEach(key => sum += (((confHist[key].length) ** (2) ))); // adjusted
    let singleConfCount = authorNumberConferences[author];
    let y0 = 1/2 + 0.01;    // 0.51 -- the starting point of the upper part of the diversity
    let d = 1 / (1 - y0) - 1;   // 1.04
    let diversity = (sum == 0)
        ? 1 -  1/(singleConfCount + d)
        : 1/(sum**(1/2));
    return diversity;
    }

function diversity3(author) // based on sum
    {
    let sum = 0;
    let confHist = Object.groupBy(authorConferences[author], (e => e));
    Object.keys(confHist)
        .filter(key => confHist[key].length > 1)    // just count conferences with more than one paper
        .forEach(key => sum += (((confHist[key].length) ** (2) ))); // adjusted
        //.forEach(key => sum += (((confHist[key].length) ** (3/2) ))); // initial
//console.log(confHist, diversity);
//throw "stop";
//    sum /= authorNumberConferences[author]; // normalize so that one in each gives no penalty
    let offset = 2.99; // 3 - epsilon
    sum = (sum == 0)? 1: sum - offset;
    let diversity = 1 / sum;
    return diversity;
    }

function diversity2(author) // based on product
    {
    let diversity = 1;
    let confHist = Object.groupBy(authorConferences[author], (e => e));
    Object.keys(confHist)
            .forEach(key => diversity *= 1 / (((confHist[key].length) ** (3/2) ))); // initial
    //          .forEach(key => diversity *= 1 / (((confHist[key].length) ** (2) )));     // higher penalty for many
//console.log(confHist, diversity);
//throw "stop";
    return diversity;
    }

function runAnalysis()
    {
    let spreadsheetData = [];  // for spreadsheet ouptut
    let conferenceNames = Object.keys(conferences);
    let confResults = conferenceNames.map(conference => analyseConference(conference, conferences[conference]));

    // introduced for similarity analysis - a list of all the papers
    masterList = conferenceNames.reduce((accum, confName) =>  [...accum, ...conferences[confName]], []);

    // aggregations
    Object.keys(authorConferences)
        .forEach(id => authorNumberConferences[id] = [...new Set(authorConferences[id])].length);

    let confLevelStats = confResults.map(({summaryStats}) => summaryStats);
    spreadsheetData.push({json:confLevelStats, title: "Conference level statistics"});

    // papers per author histogram
    let paperFreqList = Object.keys(paperFrequency)
                              .map(key => paperFrequency[key]);
    let paperFreqHistogram = Object.groupBy(paperFreqList, (e => e));                                  
    let paperFrequencies = Object.keys(paperFreqHistogram);
 //   paperFrequencies.sort((a, b) => paperFreqHistogram[b].length - paperFreqHistogram[a].length);   
    paperFrequencies = paperFrequencies.map(papers => ({papers, frequency:paperFreqHistogram[papers].length}));
    spreadsheetData.push({json:paperFrequencies, title: "Papers per author"});


    // gatekeeper info
    spreadsheetData.push({json:gatekeeperHistogram, title: "Gatekeepers"});
    // edtior info - only applicable when running on one conference - not overall.
//    spreadsheetData.push({json:editorPapers, title: "Editors"});

    // paper stats for jasp analysis
    spreadsheetData.push({json:papStats, title: "Byline"});


  /*  let xStats = {};
    // do cross conference analysis
    confResults.forEach(({authorsStat:au1},i) => 
            {
            confResults.forEach(({authorsStat:au2},j) => 
                {
                if (i < j)
                    {
                    let namei = confResults[i].summaryStats.name;
                    let namej = confResults[j].summaryStats.name;
                    let set = new Set(au1.map(({Author}) => Author));
                    let list = au2.map(({Author}) => Author);
                    let XconfList = list.filter(e => set.has(e));
                    // store results
                    XconfList.forEach(name => 
                        {
                        if (!(name in xStats))
                            {
                            xStats[name] = {frequency:[], conferences:[]};
                            }
                        let record = xStats[name]
                        let conf = record.conferences;
                        let freq = record.frequency;
                        if (!conf.includes(namei))
                            {
                            conf.push(namei);
                            freq.push(au1.find(({Author}) => Author == name).Frequency);
                            }
                        if (!conf.includes(namej))
                            {                            
                            conf.push(namej);
                            freq.push(au2.find(({Author}) => Author == name).Frequency);
                            }
                        });
                    }
                });
            });*/

    let noConferences = confResults.length;
    let noAuthors = Object.keys(authorShort).length;
    let noPapers = conferenceNames.map(conference => conferences[conference].length)
                                .reduce((accumulator, count) => accumulator + count, 0);
////    let xConfAuthors = Object.keys(xStats);
////    let xConfAuthors = Object.keys(authorConferences)
////                           .filter(id => 
////                                {
////                                let confs = authorConferences[id];                                
////                                let confs2 = [...new Set(confs)];
//console.log(id, authorConferences[id], confs, confs2)
//            throw "stop there"                                
////                                return confs2.length > 1;    // only include those with more than one conference
////                                });

    let xConfAuthors = Object.keys(authorNumberConferences)
                             .filter(id => authorNumberConferences[id] > 1);


//console.log(Object.keys(authorConferences));                            
//console.log(xConfAuthors);                            

    let noAuthorsXconferences = xConfAuthors.length;
////    let maxConfsForAuthor = Math.max(...xConfAuthors.map(author => xStats[author].frequency.length));
////    let maxPapersForXauthor = Math.max(...xConfAuthors.map(author => Math.max(...xStats[author].frequency)));
////    let totalPapersForXauthor = Math.max(...xConfAuthors.map(author => xStats[author].frequency.reduce((a,e) => a+e, 0)));

////    let maxConfsForAuthor = Math.max(...xConfAuthors.map(id => [...new Set(authorConferences[id])].length));
    let maxConfsForAuthor = Math.max(...xConfAuthors.map(id => authorNumberConferences[id]));
    let maxPapersForXauthor = Math.max(...xConfAuthors.map(id => 
            {
            let confHist = Object.groupBy(authorConferences[id], (e => e));
            let uniqConf = Object.keys(confHist);
            uniqConf.sort((a,b) => confHist[b].length - confHist[a].length);
            return confHist[uniqConf[0]].length;    // first element
            }));
    let totalPapersForXauthor = Math.max(...xConfAuthors.map(id => authorConferences[id].length));
    // authors sailing under the radar - ratio of authors in multiple conferences, but with no more than 1 paper in each conference- sailing under the radar authors
////    let authorsUnderRadar = xConfAuthors.filter(id => xStats[id].frequency.every(f => f == 1))
////                .length;

////let authorsUnderRadar = xConfAuthors.filter(id => authorConferences[id].length == [...new Set(authorConferences[id])].length)
    let authorsUnderRadar = xConfAuthors.filter(id => authorConferences[id].length == authorNumberConferences[id])
                .length;

    let portionsUnderRadar = (100 * authorsUnderRadar/xConfAuthors.length).toFixed(1);
//console.log({authorsUnderRadar, portionsUnderRadar});                
    // marshall and output the results
    let xResults = {noConferences, noPapers, noAuthors, noAuthorsXconferences, maxConfsForAuthor, maxPapersForXauthor, totalPapersForXauthor, authorsUnderRadar, portionsUnderRadar};
    spreadsheetData.push({json:[xResults], title: "cross conf statistics"});

    // show histogram
////    let xhist = Object.groupBy(xConfAuthors.map(author => xStats[author].frequency.length),(e => e));

////    let xhist = Object.groupBy(xConfAuthors.map(id => [...new Set(authorConferences[id])].length),(e => e));
    let xhist = Object.groupBy(xConfAuthors.map(id => authorNumberConferences[id]),(e => e));
////    let papersPerXauthor = xConfAuthors.map(author => xStats[author].frequency.reduce((a,e) => a+e, 0));
    let papersPerXauthor = xConfAuthors.map(id => authorConferences[id].length);
    let xhist2 = Object.groupBy(papersPerXauthor, (e => e));

    let xhistKeys = Object.keys(xhist);
    let authorsMultiConferences = xhistKeys.map(noConferences => ({noConferences,noAuthors:xhist[noConferences].length}));
    spreadsheetData.push({json:authorsMultiConferences, title: "Hist no conf. author freq."});

    let xhist2Keys = Object.keys(xhist2);
    let papersMultConferences = xhist2Keys.map(noPapers => ({noPapers,noAuthors:xhist2[noPapers].length}));
    spreadsheetData.push({json:papersMultConferences, title: "Hist total papers author freq."});
      
////    let xConfActiveAuthors = xConfAuthors.map((author,i) => ({author:authorShort[author], country:country(author),papers: papersPerXauthor[i], noConf:[...new Set(authorConferences[author])].length}));
    let xConfActiveAuthors = xConfAuthors.map((author,i) => ({author:authorShort[author], country:country(author),papers: papersPerXauthor[i], noConf:authorNumberConferences[author]}));
    xConfActiveAuthors.sort((a,b) => b.noConf - a.noConf);
    spreadsheetData.push({json:xConfActiveAuthors, title: "Authors in mult. conf. "+ xConfActiveAuthors.length});

    // highest publication count
    let ids = Object.keys(paperFrequency);
    ids.sort((a,b) => paperFrequency[b] - paperFrequency[a]);
    const paperLimit = 1;
    ids = ids.filter(id => paperFrequency[id] > paperLimit);
    let authorsWithMultiplePapers = ids.map(id => ({name: authorShort[id],country: country(id),frequency: paperFrequency[id]}));  
    spreadsheetData.push({json:authorsWithMultiplePapers, title: "Authors with mult. pap. "+authorsWithMultiplePapers.length});

    // country analysis - those with multiple papers versus, those without
    let countriesMultiple = authorsWithMultiplePapers.map(({country}) => country);
    let countriesSingle = Object.keys(paperFrequency)
                            .filter(id => paperFrequency[id] == 1)
                            .map(id => country(id));
    let countryMultHist = Object.groupBy(countriesMultiple, (e => e));
    let countrySingHist = Object.groupBy(countriesSingle, (e => e));
    let countHistKey = [...new Set([...Object.keys(countryMultHist), ...Object.keys(countrySingHist)])];
    let countryHistTable = countHistKey.map(key => 
        {
        let singlePaper = key in countrySingHist ? countrySingHist[key].length:0;
        let multiplePaper = key in countryMultHist ? countryMultHist[key].length:0;
        let totalPapers = singlePaper + multiplePaper;
        let portionMultipleSingle = (100 * multiplePaper / totalPapers).toFixed(1);
        return ({key, singlePaper, multiplePaper, totalPapers, portionMultipleSingle});
        });
    spreadsheetData.push({json:countryHistTable, title: "Country analysis"});

    // conference collaboration strengths
    // commented as surpassed by the co-occurence caluclations below
/*    let confHist = Object.groupBy(xConfAuthors.map(author => xStats[author].conferences),(e => e));
    let confCollabTable = Object.keys(confHist) 
                                .map(collab => ({constillation: JSON.stringify(collab).replaceAll(",","-"), frequency:confHist[collab].length}));
    confCollabTable.sort((a, b) => b.frequency - a.frequency);
    spreadsheetData.push({json:confCollabTable, title: "Conference collaborations"});
*/

    // co-occurrence matrix
//console.log("conference names", conferenceNames)
    // initialize
    let coOccurence = {};
    conferenceNames.forEach(name1 => 
        {
        conferenceNames.forEach(name2 => 
            {
            if (name1 != name2)
                {
                coOccurence[name1+"-"+name2] = 0;   
                }    
            });
        });
    // count
////    let groups = xConfAuthors.map(author => xStats[author].conferences);
    let groups = xConfAuthors.map(id => [...new Set(authorConferences[id])]);
    groups.forEach(group => 
        {
        for (let i = 0; i < group.length; i++)
            {
            for (let j = i+1; j < group.length; j++)
                {
//                console.log(group[i]+"-"+group[j]);
                coOccurence[group[i]+"-"+group[j]]++;   // count it.
                }
            }
        });
    // wrap over
    let coOccurenceList = [];
    conferenceNames.forEach((name1,i) => 
        {
        conferenceNames.forEach((name2, j) => 
            {
            if (i < j)
                {
                let lowerId = name1+"-"+name2;
                let upperId = name2+"-"+name1;
                let destinationId = lowerId.replaceAll(".csv-"," and ").replaceAll(".csv","");
                let sum = coOccurence[lowerId] + coOccurence[upperId];  
                coOccurenceList.push({pair:destinationId, frequency:sum}); 
                }
            });
        });
    // output
    coOccurenceList = coOccurenceList.filter(({frequency}) => frequency > 0);
    coOccurenceList.sort((a, b) => b.frequency - a.frequency);
//console.log(coOccurenceList);
    spreadsheetData.push({json:coOccurenceList, title: "Co-occurrences"});


    let nameList = Object.values(authorShort);
    let nameHist = Object.groupBy(nameList, (e => e));
    nameList = Object.keys(nameHist);
    nameList = nameList.filter(name => nameHist[name].length > 1);
    nameList.sort((a, b) => nameHist[b].length - nameHist[a].length ); 
    let identicalNames = nameList.map(name => ({name,frequency: nameHist[name].length}));
    spreadsheetData.push({json:identicalNames, title: "Identical names"});

    // calc author position statistics
    let positionStats = {};
    Object.keys(authorPosition)
          .forEach(id => {
                         let hist = Object.groupBy(authorPosition[id], (e => e));
                         let solo = "solo" in hist ? hist["solo"].length : 0;
                         let first = "first" in hist ? hist["first"].length : 0;
                         let middle = "middle" in hist ? hist["middle"].length : 0;
                         let last = "last" in hist ? hist["last"].length : 0;
                         positionStats[id] = {solo, first, middle, last};
                         });
//console.log(positionStats);


// store author data
    let authorDetails = Object.keys(paperFrequency)
                              .map(id => ({name:authorShort[id], noPapers: paperFrequency[id], noConf: authorNumberConferences[id], diversity: diversity(id), solo: positionStats[id].solo, first: positionStats[id].first,middle: positionStats[id].middle, last: positionStats[id].last, citations: citations[id], gatekeeper: gatekeepers.has(id), similarity: authorSimilarities(id)}));
////                              .map(id => ({name:authorShort[id], noPapers: paperFrequency[id], noConf: [...new Set(authorConferences[id])].length, diversity: ([...new Set(authorConferences[id])].length / paperFrequency[id]).toFixed(2)}));
    spreadsheetData.push({json:authorDetails, title: "Author details"});

    // uncommented since it is not really used and causes problems with excel probably due to dodgy characters.
 /*   let frequentName = nameList[0];    
    let idList = Object.keys(paperFrequency);
    let repeatedNames = [];
    idList.forEach(id => 
        {
        let shortName = authorShort[id];
        if (shortName == frequentName)
            {
            repeatedNames.push({id, name: authorFull[id].replaceAll(",", " "), affiliation: authorAffiliation[id].replaceAll(","," - ").replaceAll(";"," | ")});
            }
        });
    spreadsheetData.push({json:repeatedNames, title: "Top repeated Names: "+frequentName});*/
   
    let prefixFilename = (conferenceNames.length > 1)
        ? "multi-"
        : "";
    prefixFilename += conferenceNames[0].split(".")[0];
console.log(prefixFilename);
    exportSpreadSheet(spreadsheetData, "scopus-conference-analysis-"+prefixFilename+".xlsx");   
    }

function exportSpreadSheet(data, filename)
    {
    var wb = XLSX.utils.book_new();
    data.forEach(({json, title}) =>
        {
        XLSX.utils.book_append_sheet(wb, prepareSheet(json), title);        
        });
    XLSX.writeFile(wb,filename);       
    }

function prepareSheet(json)
    {
    json = JSON.parse(JSON.stringify(json));
    return XLSX.utils.json_to_sheet(json);
    }

function country(id)
    {       
    return authorAffiliation[id].split(",").pop().trim();
    }

function analyseConference(name, content)
    {
//    console.log("Proceeding "+name);        
    // cleanup
    let cleanContent = content.filter(({[SCOPUS_AUTHOR]:Authors}) => Authors != undefined)
                              .filter(({[SCOPUS_REFERENCE]:ref}) => ref != undefined)
                              .filter(({[SCOPUS_DOCUMENT_TYPE]:doc}) => doc != undefined)
                              .filter(({[SCOPUS_DOCUMENT_TYPE]:doc}) => doc == SCOPUS_CONFERENCE || doc == SCOPUS_ARTICLE);

    let essentialFields = [SCOPUS_CITATIONS, SCOPUS_AUTHOR, SCOPUS_REFERENCE];
//console.log(essentialFields, essentialFields.length)        
//essentialFields.filter(o => o != undefined).forEach(label => console.log(label)); 

    // consistency check
    essentialFields.forEach(label =>
        {
        if (!cleanContent.some(({[label]:item}) => item != undefined))
                {
                console.log("Field missing "+label);
                }
        });  

    // find type of deliminator used
    SCOPUS_AUTHOR_DELIMINATOR = cleanContent.some(({[SCOPUS_AUTHOR]:Authors}) => Authors.includes(";")) ? ";" : ",";
    SCOPUS_REFERENCE_DELIMINATOR = cleanContent.some(({[SCOPUS_REFERENCE]:References}) => References.includes(";")) ? ";" : ",";
    
    // find author this is about - the most frequent one
    const allAuthorsList = cleanContent.map(({[SCOPUS_AUTHOR]:Authors}) => Authors)
        .filter(authors => authors != undefined)
        .flatMap(authors => authors.split(SCOPUS_AUTHOR_DELIMINATOR))
        .map(author => author.replaceAll("-","")) // evidence of inconsistent use of hyphens                           
        .map(author => author.trim());
    // find author quantities
    let bylineStats = cleanContent.map(({[SCOPUS_AUTHOR]:Authors}) => Authors)
        .filter(authors => authors != undefined)
        .map(authors => authors.split(SCOPUS_AUTHOR_DELIMINATOR).length);
    bylineStats.sort((a, b) => a - b);
    let medianNoAuthors = bylineStats[Math.round(bylineStats.length/2)];
    let meanNoAuthors = bylineStats.reduce((accumulator, no) => accumulator +no, 0) / bylineStats.length;
//console.log(bylineStats);
//console.log({medianNoPapers,meanNoPapers});



    // extract other author info
    const allAuthorIDs = cleanContent.map(({[SCOPUS_AUTHOR_ID]:AuthorsIDs}) => AuthorsIDs)
        .filter(AuthorsIDs => AuthorsIDs != undefined)
        .flatMap(AuthorsIDs => AuthorsIDs.split(SCOPUS_AUTHOR_DELIMINATOR))
        .map(AuthorsID => AuthorsID.trim());
    const allAuthorAffiliations = cleanContent.map(({[SCOPUS_AFFILIATIONS]:affiliations}) => affiliations)
        .filter(affiliations => affiliations != undefined)
        .flatMap(affiliations => affiliations.split(SCOPUS_AUTHOR_DELIMINATOR))
        .map(affiliation => affiliation.trim());
    const allAuthorFullname = cleanContent.map(({[SCOPUS_AUTHOR_FULLNAME]:fullNames}) => fullNames)
        .filter(fullNames => fullNames != undefined)
        .flatMap(fullNames => fullNames.split(SCOPUS_AUTHOR_DELIMINATOR))
        .map(fullName => fullName.trim());
    // put info into records for easy lookup
    if (allAuthorsList.length !==  allAuthorIDs.length || allAuthorIDs.length !== allAuthorFullname.length || allAuthorAffiliations.length !== allAuthorFullname.length)
        {
        console.log(name+": Problem",allAuthorsList.length,allAuthorIDs.length, allAuthorAffiliations.length, allAuthorFullname.length);
        throw "Problem with data";
        }
    // all lookup on authorID as primary key
    allAuthorsList.forEach((shortAuthor,i) =>
        {
        let authorID = allAuthorIDs[i];
        let affiliation = allAuthorAffiliations[i];
        let fullName = allAuthorFullname[i];
        authorShort[authorID] = shortAuthor;
        authorFull[authorID] = fullName;
        authorAffiliation[authorID] = affiliation;
        });

    let onAuthorsList = Object.groupBy(allAuthorIDs, (author => author));
    let uniqueAuthors = [...Object.keys(onAuthorsList)];

    // keep track of overall no authors, but do not overwrite other stuff
    uniqueAuthors.forEach(id =>
        { 
        if (!(id in paperFrequency)) 
            {
            paperFrequency[id] = 0;
            }
        });    // set counter to zero
    allAuthorIDs.forEach(id => paperFrequency[id]++);           // count each instance

    // conf statistics for xConf analysis
    uniqueAuthors.forEach(id =>
            { 
            if (!(id in authorConferences)) 
                {
                authorConferences[id] = [];
                }
            });  
    allAuthorIDs.forEach(id => authorConferences[id].push(name));           // count each instance

//console.log(authorConferences)

    let authorsStat = uniqueAuthors.map(author => ({Author:author, Frequency: onAuthorsList[author].length}))
                            .sort((a,b) => b.Frequency - a.Frequency);



//console.log(authorsStat);

    // compute simple statistics
    let maxPapersPerAuthor = authorsStat[0].Frequency;
    let noAuthorsWithMultiplePapers = authorsStat.filter(({Frequency}) => Frequency > 1).length; 
    let noUniqueAuthors = uniqueAuthors.length;
    let noPapers = cleanContent.length;

    // number of papers with repeated authors
    let repeatedAuthors = authorsStat.filter(({Frequency}) => Frequency > 1)
                                    .map(({Author}) => Author);
//    let noPapersWithRepeatedAuthors = cleanContent.filter(({[SCOPUS_AUTHOR]:authors}) => repeatedAuthors.some(repeatedAuthor => authors.includes(repeatedAuthor))).length;
    let noPapersWithRepeatedAuthors = cleanContent.filter(({[SCOPUS_AUTHOR_ID]:authors}) => repeatedAuthors.some(repeatedAuthor => authors.includes(repeatedAuthor))).length;




    // Similarity analysis 03/11/2024 -- for R2
    // group papers by repeated authors
//    console.log(repeatedAuthors);
    let repeatedPaperGrouping = cleanContent.filter(({[SCOPUS_AUTHOR_ID]:authors}) => repeatedAuthors.some(repeatedAuthor => authors.includes(repeatedAuthor)))
                .reduce((accum, paper) => 
                    {
                    let authors = paper[SCOPUS_AUTHOR_ID];
                    let detectedAuthors = repeatedAuthors.filter(repeatedAuthor => authors.includes(repeatedAuthor));
                    detectedAuthors.forEach(detectedAuthor => 
                        {
                        if (detectedAuthor in accum)
                            {
                            accum[detectedAuthor].push(paper);
                            }
                        else    
                            {
                            accum[detectedAuthor] = [paper];  
                            }
                        });
                    return accum;
                    } , {});
//    console.log(repeatedPaperGrouping);
    // Do the similarity analysis for paper with repeat authors
    let repeatSimilarities = repeatedAuthors.map(author => ({author, ...paperSetSimilarity(repeatedPaperGrouping[author])}));
    let repeatSimMedian = medianNumber(repeatSimilarities.map(({similarityMedian}) => similarityMedian)); 
    let repeatSimMax = medianNumber(repeatSimilarities.map(({similarityMax}) => similarityMax)); 

/*let al = repeatSimilarities.map(({similarityMedian}) => similarityMedian);
let bl = repeatSimilarities.map(({similarityMax}) => similarityMax);
al.sort((a,b) => a - b );
bl.sort((a,b) => a - b );
console.log(al);    
console.log(bl);    
throw "testing"*/
//    console.log(repeatSimilarities)
/*, 
        repeatSimilarities.map(({similarity}) => similarity),
        repeatSimMedian);*/
    // Do the similarity of other papers without repeat authors as baseline
    let noRepetitions = cleanContent.filter(({[SCOPUS_AUTHOR_ID]:authors}) => repeatedAuthors.some(repeatedAuthor => !authors.includes(repeatedAuthor)));
//console.log(noRepetitions);    
    let uniqueSimilarities = baselineSimilarities(noRepetitions);
    let uniqueSimMedian = medianNumber(uniqueSimilarities.map(({similarityMedian}) => similarityMedian)); 
    let uniqueSimMax = medianNumber(uniqueSimilarities.map(({similarityMax}) => similarityMax)); 
//    console.log(uniqueSimilarities, uniqueSimMedian, uniqueSimMax);

//throw "breakpoint"

    // DEMOs based on similar author profiles
    // check to see if there are potential demo papers. Based on looking for iodentical author profiles.  
    let duplicatePapers = Object.groupBy(cleanContent, (({[SCOPUS_AUTHOR_ID]:authors}) =>authors));
    let allAuthorProfiles = Object.keys(duplicatePapers);
    let duplicates = allAuthorProfiles.filter(authors => duplicatePapers[authors].length > 1)
                     .map(authors => duplicatePapers[authors].map(({[SCOPUS_TITLE]:title}) =>title));
    console.log("duplicates for "+name);
    console.log(duplicates);

    // get paper statistics for analysis in jast later
    papStats.push(...cleanContent.map(({[SCOPUS_AUTHOR_ID]:Authors}) => Authors)
        .filter(authors => authors != undefined)
        .map(authors => ({numberAuthors:authors.split(SCOPUS_AUTHOR_DELIMINATOR).length, repeatedAuthors:repeatedAuthors.some(repeatedAuthor => authors.includes(repeatedAuthor))})));

//console.log(papStats)

    // determine author position
    uniqueAuthors.forEach(id => 
        {
        if (!(id in authorPosition))
            {
            authorPosition[id] = [];    // initialize all
            }
        });
    cleanContent.map(({[SCOPUS_AUTHOR_ID]:authors}) => authors)
                .forEach(authors => 
                    {
                    let authorList = authors.split(SCOPUS_AUTHOR_DELIMINATOR)
                                            .map(AuthorsID => AuthorsID.trim());
  

                    let first = authorList.shift();
                    let last = authorList.pop();
                    if (authorList.length == 0 && last == undefined)
                        {
                        authorPosition[first].push("solo");
                        }
                    else if (first != undefined) 
                        {
                        authorPosition[first].push("first");
                        }
                    if (last != undefined) 
                        {
                        authorPosition[last].push("last");
                        }
                    authorList.map(id => authorPosition[id].push("middle"));
                    });

//console.log(authorPosition);

/// detailed output for paper based on extreme
/*let maxID = authorsStat[1].Author;

//let maxID = authorsStat[0].Author;
console.log({maxID},authorShort[maxID]);
let selected = cleanContent.filter(({[SCOPUS_AUTHOR_ID]:authorID}) => authorID.includes(maxID));
console.log(selected.map(p => p[SCOPUS_AUTHOR] + ":" + p[SCOPUS_TITLE]).join("\n"));
let selHist = Object.groupBy(selected, (({[SCOPUS_TITLE]:title}) => title));
console.log(selHist);
*/
// find number of "Demonstrations of" in CHI
/*let demos = cleanContent.filter(({[SCOPUS_TITLE]:title}) => title.includes("Demonstration of "));
console.log(demos);*/

    // add median reference age.
    let pubAgeMedianList = cleanContent.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
                .map(({[SCOPUS_REFERENCE]:References, [SCOPUS_YEAR]:year}) => 
        {
        let pubAge = References.split(SCOPUS_REFERENCE_DELIMINATOR)
                            .map(ref => ref.match(/\d{4}/))
                            .map(refYear => Number(refYear))
                            .filter(refYear => refYear <= Number(year))
                            .filter(refYear => refYear > 1800)
                            .map(refYear => year - refYear);    
        pubAge.sort();
        let medianAge = pubAge[Math.floor(pubAge.length/2)];
        return medianAge;
        });
    pubAgeMedianList.sort((a, b) => b - a);
    let medianAge = pubAgeMedianList[Math.floor(pubAgeMedianList.length/2)]




    // citation analysis
    // set up structure
    uniqueAuthors.forEach(id => citations[id] = citations[id] ?? 0); // burde bruke reduce istedet
 //   console.log(citations);    
    // add the citations
    cleanContent.forEach(({[SCOPUS_AUTHOR_ID]:authors, [SCOPUS_CITATIONS]:citationCount}) => 
                {
                let authorList = authors.split(SCOPUS_AUTHOR_DELIMINATOR)
                                        .map(AuthorsID => AuthorsID.trim());
                                     //   .map(id => Number(id));
//authorList.forEach(id => console.log(uniqueAuthors.includes(id)));
//authorList.forEach(id => console.log(citations[id]));
                authorList.forEach(id => citations[id] += Number(citationCount));
                });
//console.log(citations);
    


    // editor analysis -- based on editor field
 /*   let editorList = cleanContent.filter(({[SCOPUS_EDITORS]:editors}) => editors != undefined)
        .map(({[SCOPUS_EDITORS]:editors}) => editors);   
    editorList = [...new Set(editorList)];    
    console.log(editorList);
    if (editorList.length > 0)
        {
        // extract the editors
        let editors = editorList.join(SCOPUS_REFERENCE_DELIMINATOR)  // incase there are more editors in multivolume, e.g. HCII
                                .split(SCOPUS_REFERENCE_DELIMINATOR)
                                .map(editor=> editor.trim());
        editors = [...new Set(editors)];    
        console.log(editors);
        // see if editors are authors
        editorPapers = editors.map(editor => 
            {
            let editorId = allAuthorIDs.find(id => authorShort[id] == editor);
            let count = (editorId !== undefined)
                ? paperFrequency[editorId]
                : 0;
            return {editor,editorId,count};
            });
        console.log(editorPapers);
        }*/


    // new editor/gatekeeper analysis - based on editorials instead of editor field
    let editorList = content.filter(({[SCOPUS_DOCUMENT_TYPE]:editorials}) => editorials == "Editorial")
                                 .map(({[SCOPUS_AUTHOR_ID]:editors}) => editors)
                                 .filter(editors => editors != undefined)
                                 .flatMap(editors => 
                                     {
                                     return editors.split(SCOPUS_AUTHOR_DELIMINATOR)
                                                   .map(AuthorsID => AuthorsID.trim());
                                     });

    editorList = [...new Set(editorList)];
    editorList.forEach(editor => gatekeepers.add(editor));    

    console.log("gatekeeper/editor analysis: ",name/*, editorList*/);
    editorPapers = editorList.map(editor => 
        {
        let byEditors = cleanContent.filter(({[SCOPUS_DOCUMENT_TYPE]:editorials}) => editorials != "Editorial")
                                    .map(({[SCOPUS_AUTHOR_ID]:editors}) => editors)
                                    .filter(editors => editors.includes(editor));
        console.log(authorShort[editor]??editor,byEditors.length);           
        return byEditors;
        });
//    console.log(editorPapers);
    console.log("end editors.");
    // compute histogram
    let editorHistogram = Object.groupBy(editorPapers, (e => e.length));
//console.log(editorHistogram)    
    let entry = Object.keys(editorHistogram)
                      .reduce((accumulator, key) => 
                        {
                        accumulator[key] = editorHistogram[key].length;
                        return accumulator;
                        },{});
    gatekeeperHistogram.push({name,...entry}); // add entry to global structure
//console.log(gatekeeperHistogram);
    // end new editor analysis

    // median no of reference
    let refLengthMedianList = cleanContent.filter(({[SCOPUS_REFERENCE]:References}) => References != undefined)
        .map(({[SCOPUS_REFERENCE]:References}) => References.split(SCOPUS_REFERENCE_DELIMINATOR).length);
    refLengthMedianList.sort((a, b) => b - a);
    let medianReferencelistLength = refLengthMedianList[Math.floor(refLengthMedianList.length/2)]

    // aggregated stats
    let authorsPerPaper = (noUniqueAuthors/noPapers).toFixed(2);
    let portionAuthorsWithMultiplePapers = (noAuthorsWithMultiplePapers/noUniqueAuthors).toFixed(2);
    let portionPapersWithMultipleAuthors = (noPapersWithRepeatedAuthors/noPapers).toFixed(2);
    
    // output the results
    let summaryStats = {name, maxPapersPerAuthor, noAuthorsWithMultiplePapers, noUniqueAuthors, noPapers, noPapersWithRepeatedAuthors, medianAge, medianReferencelistLength, authorsPerPaper, medianNoAuthors,meanNoAuthors, portionAuthorsWithMultiplePapers, portionPapersWithMultipleAuthors, repeatSimMedian, repeatSimMax, uniqueSimMedian, uniqueSimMax};
    return {summaryStats, authorsStat};
    }

function show(id)
    {
    document.getElementById(id).style = "display: block;"; 
    }
function hide(id)
    {
    document.getElementById(id).style = "display:none;"; 
    }



// added 03/11/2024
function medianNumber(list)
    {
//    list.sort((a,b) => a > b? 1: 0);
    list.sort((a,b) => a - b);
    let midPoint = Math.floor(list.length / 2);
    if ((list.length % 2) == 0)
        {
        return (list[midPoint - 1] + list[midPoint]) / 2; 
        }
    else    
        {
        return list[midPoint];
        }
//    let midPoint = Math.floor(list.length / 2);
//    return list[midPoint];
    }

/*    console.log(medianNumber([]))
    console.log(medianNumber([2]))
    console.log(medianNumber([2,3]))
    console.log(medianNumber([2,3,5]))
    console.log(medianNumber([2,3,5,6]))
    console.log(medianNumber([2,3,5,6,9]))*/

function paperSetSimilarity(paperList)
    {
    let similarities = [];
    paperList.forEach(p1 => 
        {
        paperList.forEach(p2 => 
            {
            if (p1.EID !== p2.EID)
                {
                let sim = paperSimilarity(p1, p2);
                similarities.push(sim);
                }
            })
        });
    return ({similarityMedian: medianNumber(similarities), similarityMax: Math.max(...similarities)});
//    similarities.sort((a,b) => a > b? 1: 0);
//    let midPoint = Math.floor(similarities.length / 2);
//    return similarities[midPoint];
    }

function getKeywords(paper)
    {
//console.log(paper)
//console.log(paper[SCOPUS_AUTHOR_KEYWORDS])
    if (paper == undefined)
        {
        return [];
        }
    let keywords = (paper[SCOPUS_AUTHOR_KEYWORDS]??"").split(";");
    keywords = [...keywords, ...(paper[SCOPUS_INDEX_KEYWORDS]??"").split(";")];
    keywords = keywords.map(keyword => keyword.trim())
                       .map(keyword => keyword.toLowerCase());
//    console.log(keywords)
    return keywords;
    }

function bagOfWordsDifference(keywords1, keywords2)
    {
    return bagDifference(new Set(keywords1), new Set(keywords2));
//    let set1 = new Set(keywords1);
//    let set2 = new Set(keywords2);
//    let intersection = set1.intersection(set2);
//console.log(set1, set2, intersection)    
//    return 2 * intersection.size / (set1.size + set2.size); 
    }

function bagDifference(set1, set2)
    {
    let intersection = set1.intersection(set2);
    return 2 * intersection.size / (set1.size + set2.size);         
    }
//console.log(bagOfWordsDifference(["one","two","three"], ["four","two","three"]));

function paperSimilarity(p1, p2)
    {
    // extract all the keywords
    let keywords1 = getKeywords(p1);
    let keywords2 = getKeywords(p2);
    return bagOfWordsDifference(keywords1, keywords2);
    }

function baselineSimilarities(noRepetitions)
    {
    // prepare efficient datastructure
    noRepetitions = noRepetitions.map(paper => ({...paper, keywords: getKeywords(paper)}) )
                                 .map(paper => ({...paper, bagOfWords: new Set(paper.keywords)}));
    // for each paper process and find similarity profile with others
    noRepetitions = noRepetitions.map((p1,i) => 
        {
        let similarities = noRepetitions.filter((p2,j) => i !== j)
                                        .map(p2 => bagDifference(p1.bagOfWords, p2.bagOfWords));
        return ({...p1, similarities});
        });
    // find and return the descriptive  --- added a 0 at the end of the max in case it is a empty array
    return noRepetitions.map(paper => ({...paper, similarityMedian: (paper.similarities.length > 0 ? medianNumber(paper.similarities):0), similarityMax: Math.max(...paper.similarities, 0)}));
    }

function authorSimilarities(author)
    {
    // get list of papers grouped by conference where the author is co-author
    let authorList = masterList.filter(({[SCOPUS_AUTHOR_ID]:authors}) => authors !== undefined)
                               .filter(({[SCOPUS_AUTHOR_ID]:authors}) => authors.includes(author));
    // compute similarity across all these papers- we later group according to diversity
    let similarityList = baselineSimilarities(authorList);
    let meanSimilarity = medianNumber(similarityList.map(({similarityMedian}) => similarityMedian)); 
    return meanSimilarity;
    }
