/*
 * bionode-vcf
 * https://github.com/shyamrallapalli/bionode-vcf
 *
 * Copyright (c) 2015 Shyam Rallapalli and Martin Page
 * Licensed under the MIT license.
 */

var fs = require('fs')
var readline = require('readline')
var Stream = require('stream')
var events = require('events')

var vcf = new events.EventEmitter()

vcf.read = function (path) {
  var instream = fs.createReadStream(path)
  var outstream = new Stream()
  var rl = readline.createInterface(instream, outstream)

  var numSamples = 0
  var sampleIndex = {}
  var vcfAttrib = {}

  rl.on('line', function (line) {
    // check if line starts with hash and use them
    if (line.indexOf('#') === 0) {
      // ##fileformat=VCFv4.1
      if (!vcfAttrib.vcf_v) {
        vcfAttrib.vcf_v = line.match(/^##fileformat=/) ? line.split('=')[1] : null
      }

      // ##samtoolsVersion=0.1.19-44428cd
      if (!vcfAttrib.samtools) {
        vcfAttrib.samtools = line.match(/^##samtoolsVersion=/) ? line.split('=')[1] : null
      }

      // ##reference=file://../index/Chalara_fraxinea_TGAC_s1v1_scaffolds.fa
      if (!vcfAttrib.refseq) {
        vcfAttrib.refseq = line.match((/^##reference=file:/)) ? line.split('=')[1] : null
      }

      // #CHROM\tPOS\tID\tREF\tALT\tQUAL\tFILTER\tINFO\tFORMAT\tsample1\tsample2\tsample3
      // set number of samples in vcf file
      if (line.match(/^#CHROM/)) {
        var sampleinfo = line.split('\t')
        numSamples = sampleinfo.length - 9

        for (var i = 0; i < numSamples; i++) {
          sampleIndex[i] = sampleinfo[9 + i]
        }
      }
    } else { // go through remaining lines
            // split line by tab character
      var info = line.split('\t')

      if (info.length < 9) {
        var err = new Error('number of columns in the file are less than expected in vcf')
        vcf.emit('error', err)
      }

      // format information ids
      var formatIds = info[8].split(':')

      // parse the sample information
      var sampleObject = []
      for (var j = 0; j < numSamples; j++) {
        var sampleData = {}
        sampleData['NAME'] = sampleIndex[j]
        var formatParts = info[9].split(':')
        for (var k = 0; k < formatParts.length; k++) {
          sampleData[formatIds[k]] = formatParts[k]
        }
        sampleObject.push(sampleData)
      }

      // parse the variant call information
      var varInfo = info[7].split(';')
      var infoObject = {}

      // check if the variant is INDEL or SNP
      // and assign the specific type of variation identified
      var type
      var typeInfo
      if (varInfo[0].match(/^INDEL$/)) {
        type = 'INDEL'
        varInfo.shift()
        if (info[3].length > info[4].length) {
          typeInfo = 'deletion'
        } else if (info[3].length < info[4].length) {
          typeInfo = 'insertion'
        } else if (info[3].length === info[4].length) {
          typeInfo = 'substitution - multi'
        }
      } else {
        type = 'SNP'
        if (info[3].length === 1) {
          typeInfo = 'substitution'
        } else if (info[3].length > 1) {
          typeInfo = 'substitution - multi'
        }
      }
      infoObject['VAR'] = type
      infoObject['VARINFO'] = typeInfo

      // variant info added to object
      for (var l = 0; l < varInfo.length; l++) {
        var pair = varInfo[l].split('=')
        infoObject[pair[0]] = pair[1]
      }

      // parse the variant information
      var varData = {
        chr: info[0],
        pos: info[1],
        id: info[2],
        ref: info[3],
        alt: info[4],
        qual: info[5],
        filter: info[6],
        varinfo: infoObject,
        sampleinfo: sampleObject,
        attributes: vcfAttrib
      }

      // console.log('Variant data',varData);
      vcf.emit('data', varData)
    }
  })

  rl.on('close', function () {
    vcf.emit('end')
  })

  return this
}

module.exports = vcf
